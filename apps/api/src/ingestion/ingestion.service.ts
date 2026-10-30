// src/ingestion/ingestion.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
import { RedisKeys, type Tick } from "@toolhackchain/shared";
import { buildKeyId, displayName, normalizeName } from "../common/normalize.js";
import { LobbiesService } from "../lobbies/lobbies.service.js";
import { CategoriesService } from "../categories/categories.service.js";
import { StreamsService } from "../streams/streams.service.js";
import { StreamInformationService } from "../stream-information/stream-information.service.js";
import { GameSessionsService } from "../game-sessions/game-sessions.service.js";
import { gameSessionId } from "../game-sessions/game-session-id.js";
import { BoundedMap } from "./bounded-map.js";
import { IdCache } from "./id-cache.service.js";
import { ShoeObserver } from "./shoe-observer.js";
import { INVALID_LOG_INTERVAL_MS, MAX_NAME_LENGTH, MAX_RESULT_LENGTH, MEMORY_CACHE_MAX } from "./ingestion.constants.js";

const PG_FOREIGN_KEY_VIOLATION = "23503";
const MAX_INT4 = 2_147_483_647;

/** Số nguyên không âm, vừa int4; nhận number hoặc chuỗi số (đã trim). */
function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_INT4 ? n : null;
}

type Parsed = {
  keyId: string;
  lobby: string; lobbyNorm: string;
  category: string; categoryNorm: string;
  stream: string;
  streamer: string | null;
  shoe: number;
  round: number;
  result: string | null;
};
type StreamGroup = Pick<Parsed, "keyId" | "lobby" | "lobbyNorm" | "category" | "categoryNorm" | "stream"> & { streamer: string | null };
type SessionGroup = { id: string; keyId: string; shoe: number; round: number; result: string | null };
type SessionState = { result: string | null; warned?: string };

@Injectable()
export class IngestionService {
  private readonly log = new Logger(IngestionService.name);
  // Trạng thái đã biết, để tick lặp lại không phải chạm DB.
  private sessions = new BoundedMap<string, SessionState>(MEMORY_CACHE_MAX);
  private streamers = new BoundedMap<string, string>(MEMORY_CACHE_MAX);   // stream_id → streamer_id
  private lastInvalidLog = new BoundedMap<string, number>(MEMORY_CACHE_MAX); // chống spam log tick lỗi

  constructor(
    @InjectDataSource() private ds: DataSource,
    private ids: IdCache,
    private shoes: ShoeObserver,
    private lobbies: LobbiesService,
    private categories: CategoriesService,
    private streams: StreamsService,
    private streamInfo: StreamInformationService,
    private gameSessions: GameSessionsService,
  ) {}

  /** Ghi một batch tick trong một DB transaction. Ném lỗi nếu ghi thất bại (caller giữ buffer, không XACK). */
  async persist(ticks: Tick[]): Promise<void> {
    const parsed: Parsed[] = [];
    for (const t of ticks) {
      const p = this.parse(t);
      if (p) parsed.push(p);
    }
    if (parsed.length === 0) return;
    try {
      await this.run(parsed);
    } catch (e) {
      if ((e as { code?: string }).code !== PG_FOREIGN_KEY_VIOLATION) throw e;
      this.log.warn("Cache id lệch với DB (FK violation), xoá cache và thử lại");
      await this.ids.invalidate();
      this.sessions.clear();
      this.streamers.clear();
      await this.run(parsed);
    }
    // Chỉ quan sát shoe/round sau khi DB đã commit (retry batch không log trùng); không bao giờ ném lỗi.
    await this.shoes.observe(parsed.map((p) => ({ keyId: p.keyId, stream: p.stream, shoe: p.shoe, round: p.round })));
  }

  private parse(t: Tick): Parsed | null {
    const d = t?.data as Record<string, unknown> | undefined;
    const fail = (why: string): null => {
      const k = `${t?.item_id}\u0000${why}`;
      const now = Date.now();
      if (now - (this.lastInvalidLog.get(k) ?? 0) >= INVALID_LOG_INTERVAL_MS) {
        this.lastInvalidLog.set(k, now);
        this.log.warn(`Bỏ qua tick ${t?.id} (${t?.item_id}): ${why}`);
      }
      return null;
    };
    if (!d || typeof d !== "object") return fail("thiếu data");

    const names: string[] = [];
    for (const f of ["lobby_name", "category_name", "stream_name"] as const) {
      const v = d[f];
      if (typeof v !== "string" || normalizeName(v) === "") return fail(`${f} không hợp lệ`);
      if (displayName(v).length > MAX_NAME_LENGTH) return fail(`${f} quá dài`);
      if (v.includes("|")) return fail(`${f} chứa ký tự '|' (trùng dấu phân tách key_id)`);
      names.push(v);
    }
    const [lobby, category, stream] = names;

    // stream_shoe và stream_round đều là số nguyên, bắt buộc: sai thì bỏ cả tick (realtime là luồng khác, không bị ảnh hưởng)
    const shoe = toInt(d.stream_shoe);
    if (shoe === null) return fail("stream_shoe phải là số nguyên");
    const round = toInt(d.stream_round);
    if (round === null) return fail("stream_round phải là số nguyên");

    let result: string | null = null;
    const ar = d.actual_result;
    if (ar !== null && ar !== undefined) {
      if (typeof ar !== "string") return fail("actual_result phải là chuỗi hoặc null");
      result = ar.trim() === "" ? null : ar.trim();
      if (result !== null && result.length > MAX_RESULT_LENGTH) return fail("actual_result quá dài");
    }

    let streamer: string | null = null;
    if (typeof d.streamer_id === "string" && d.streamer_id.trim() !== "") {
      streamer = displayName(d.streamer_id);
      if (streamer.length > MAX_NAME_LENGTH) return fail("streamer_id quá dài");
    }

    return {
      keyId: buildKeyId(lobby, category, stream),
      lobby: displayName(lobby), lobbyNorm: normalizeName(lobby),
      category: displayName(category), categoryNorm: normalizeName(category),
      stream: displayName(stream),
      streamer, shoe, round, result,
    };
  }

  private async run(parsed: Parsed[]): Promise<void> {
    // 1) Gộp theo stream (giữ tên hiển thị lần đầu, streamer mới nhất) và theo (stream, shoe, round).
    const streamGroups = new Map<string, StreamGroup>();
    const sessionGroups = new Map<string, SessionGroup>();
    for (const p of parsed) {
      const sg = streamGroups.get(p.keyId);
      if (!sg) streamGroups.set(p.keyId, { ...p });
      else if (p.streamer) sg.streamer = p.streamer;

      const sk = `${p.keyId}\u0000${p.shoe}\u0000${p.round}`;
      const ses = sessionGroups.get(sk);
      if (!ses) sessionGroups.set(sk, { id: gameSessionId(p.keyId, p.shoe, p.round), keyId: p.keyId, shoe: p.shoe, round: p.round, result: p.result });
      else if (p.result !== null) {
        if (ses.result === null) ses.result = p.result;
        else if (ses.result !== p.result) {
          this.log.warn(`Ván ${ses.id}: trong batch có nhiều result khác nhau (${ses.result} / ${p.result}), giữ ${ses.result}`);
        }
      }
    }

    // 2) Loại những ván không có gì mới so với trạng thái đã biết.
    const todo: SessionGroup[] = [];
    for (const g of sessionGroups.values()) {
      const known = this.sessions.get(g.id);
      if (!known) { todo.push(g); continue; }
      if (g.result === null) continue;
      if (known.result === null) { todo.push(g); continue; }
      if (known.result !== g.result && known.warned !== g.result) {
        known.warned = g.result;
        this.warnConflict(g.id, known.result, g.result);
      }
    }
    todo.sort((a, b) => (a.id < b.id ? -1 : 1));

    // 3) Tra id stream từ cache.
    const keyIds = [...streamGroups.keys()].sort();
    const cached = await this.ids.getMany(keyIds.map(RedisKeys.stream));
    const streamIds = new Map<string, string>();
    const missing: StreamGroup[] = [];
    keyIds.forEach((k, i) => {
      const id = cached[i];
      if (id !== undefined) streamIds.set(k, id);
      else missing.push(streamGroups.get(k)!);
    });
    // lobby / category cho các stream mới
    const lobbyCache = new Map<string, string>();
    const categoryCache = new Map<string, string>();
    if (missing.length > 0) {
      const lobbyNorms = [...new Set(missing.map((s) => s.lobbyNorm))];
      const lobbyHits = await this.ids.getMany(lobbyNorms.map(RedisKeys.lobby));
      lobbyNorms.forEach((n, i) => { if (lobbyHits[i] !== undefined) lobbyCache.set(n, lobbyHits[i]!); });
      const catKeys = [...new Set(missing.flatMap((s) => {
        const lid = lobbyCache.get(s.lobbyNorm);
        return lid ? [RedisKeys.category(lid, s.categoryNorm)] : [];
      }))];
      const catHits = await this.ids.getMany(catKeys);
      catKeys.forEach((k, i) => { if (catHits[i] !== undefined) categoryCache.set(k, catHits[i]!); });
    }

    // 4) Streamer đổi so với giá trị đã biết (id stream mới chưa biết → xét sau khi có id).
    const needStreamInfo = (streamId: string, streamer: string | null) =>
      streamer !== null && this.streamers.get(streamId) !== streamer;

    const hasWork = missing.length > 0 || todo.length > 0
      || [...streamGroups.values()].some((s) => {
        const id = streamIds.get(s.keyId);
        return id !== undefined && needStreamInfo(id, s.streamer);
      });
    if (!hasWork) return;

    const newCache: [string, string][] = [];
    let infoWrites: { streamId: string; streamer: string }[] = [];
    let sessionState: [string, SessionState][] = [];

    await this.ds.transaction(async (m) => {
      // lobbies → categories → streams
      if (missing.length > 0) {
        missing.sort((a, b) => (a.keyId < b.keyId ? -1 : 1));
        const needLobby = [...new Map(missing.filter((s) => !lobbyCache.has(s.lobbyNorm)).map((s) => [s.lobbyNorm, s.lobby])).entries()];
        const lobbyIds = await this.lobbies.upsertMany(m, needLobby.map(([, name]) => name));
        needLobby.forEach(([norm], i) => {
          lobbyCache.set(norm, lobbyIds[i]);
          newCache.push([RedisKeys.lobby(norm), lobbyIds[i]]);
        });

        const needCat = [...new Map(missing.flatMap((s) => {
          const lid = lobbyCache.get(s.lobbyNorm)!;
          const ck = RedisKeys.category(lid, s.categoryNorm);
          return categoryCache.has(ck) ? [] : [[ck, { lobbyId: lid, name: s.category }] as const];
        })).entries()];
        const catIds = await this.categories.upsertMany(m, needCat.map(([, v]) => v));
        needCat.forEach(([ck], i) => {
          categoryCache.set(ck, catIds[i]);
          newCache.push([ck, catIds[i]]);
        });

        const newStreamIds = await this.streams.upsertMany(m, missing.map((s) => ({
          categoryId: categoryCache.get(RedisKeys.category(lobbyCache.get(s.lobbyNorm)!, s.categoryNorm))!,
          name: s.stream,
        })));
        missing.forEach((s, i) => {
          streamIds.set(s.keyId, newStreamIds[i]);
          newCache.push([RedisKeys.stream(s.keyId), newStreamIds[i]]);
        });
      }

      // stream_information (mỗi stream_id một lần)
      const byStream = new Map<string, string>();
      for (const s of streamGroups.values()) {
        const id = streamIds.get(s.keyId)!;
        if (needStreamInfo(id, s.streamer)) byStream.set(id, s.streamer!);
      }
      infoWrites = [...byStream].map(([streamId, streamer]) => ({ streamId, streamer }));
      infoWrites.sort((a, b) => (BigInt(a.streamId) < BigInt(b.streamId) ? -1 : 1));
      await this.streamInfo.upsertMany(m, infoWrites.map((w) => ({ streamId: w.streamId, streamerId: w.streamer })));

      // game_sessions
      sessionState = await this.writeSessions(m, todo, streamIds);
    });

    // Commit xong mới cập nhật cache.
    await this.ids.setMany(newCache);
    for (const w of infoWrites) this.streamers.set(w.streamId, w.streamer);
    for (const [id, st] of sessionState) this.sessions.set(id, st);
  }

  private async writeSessions(m: EntityManager, todo: SessionGroup[], streamIds: Map<string, string>): Promise<[string, SessionState][]> {
    if (todo.length === 0) return [];
    await this.gameSessions.insertMany(m, todo.map((g) => ({ id: g.id, streamId: streamIds.get(g.keyId)!, shoe: g.shoe, round: g.round })));

    const withResult = todo.filter((g): g is SessionGroup & { result: string } => g.result !== null);
    const stored = await this.gameSessions.applyResults(m, withResult.map((g) => ({ id: g.id, result: g.result })));

    return todo.map((g) => {
      const existing = stored.get(g.id);
      if (g.result !== null && existing !== undefined && existing !== g.result) {
        this.warnConflict(g.id, existing, g.result);
        return [g.id, { result: existing, warned: g.result }] as [string, SessionState];
      }
      return [g.id, { result: existing ?? null }] as [string, SessionState];
    });
  }

  private warnConflict(id: string, stored: string, incoming: string) {
    this.log.warn(`Ván ${id}: tick báo result "${incoming}" khác result đã lưu "${stored}", giữ nguyên "${stored}"`);
  }
}
