// src/realtime/realtime.hub.ts
// Kênh public: TICK (đọc stream "ticks") + ROUND_RESULT theo key_id. Không bao giờ đẩy pick ở đây —
// prediction đi qua ConnectionRegistry, chỉ tới kết nối tham gia của user đã trừ tiền.
//
// PHIÊN VÀ KẾT QUẢ CHỈ ĐI TỚI (comparePosition ở packages/shared): tick muộn của ván trước thường đến SAU tick đầu của ván mới.
// - tick: chỉ đẩy khi vị trí >= con trỏ phiên của stream; cũ hơn ⇒ bỏ (kể cả status, total, player_count, time).
// - round_result: tick có actual_result VÀ vị trí MỚI HƠN con trỏ kết quả ⇒ đẩy một lần; còn lại bỏ (không lùi, không trùng).
// State chỉ trong RAM, cập nhật cho MỌI tick (kể cả stream không ai xem), không nạp sẵn lúc khởi động: tick đầu tiên khởi tạo.
// Việc lọc chỉ áp dụng cho SSE: TickPersister (group persist) và PredictTriggerService (group predict-trigger) đọc `ticks` độc lập.
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import {
  advanceShoe, comparePosition, payloadPosition, RedisKeys, TICK_STREAM,
  type Position, type RealtimeRoundResult, type ShoeContext,
} from "@toolhackchain/shared";
import { fieldsToObject, sleep, StreamEntry } from "../common/stream.util.js";
import type { EnvVars } from "../config/env.validation.js";
import { IdCache } from "../ingestion/id-cache.service.js";
import { HUB_STATE_MAX } from "./realtime.constants.js";

type Listener = (eventJson: string) => void;

type StreamState = {
  ctx: ShoeContext;
  session: Position;              // con trỏ phiên: vị trí lớn nhất đã đẩy
  result: Position | null;        // con trỏ kết quả: ván mới nhất đã phát round_result
  lastTick: string;               // tick cuối đã chấp nhận (JSON gốc, chưa gắn stream_id) — snapshot cho kết nối mới
  lastTickAt: number;             // lúc nhận tick gần nhất (bất kỳ) — thứ tự LRU
  staleSince: number | null;      // từ lúc này chỉ nhận tick cũ hơn (null = tick gần nhất được chấp nhận)
};

const OUTCOMES: readonly string[] = ["B", "P", "T"];

@Injectable()
export class RealtimeHub implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(RealtimeHub.name);
  private conn = new Redis(process.env.REDIS_URL!);
  private running = true;
  private listeners = new Map<string, Set<Listener>>();   // item_id -> listeners
  // Thứ tự của Map = thứ tự tick gần nhất (delete + set mỗi tick): mục đầu là stream lâu không có tick nhất.
  private states = new Map<string, StreamState>();
  private readonly staleResetMs: number;

  constructor(private ids: IdCache, config: ConfigService<EnvVars, true>) {
    this.staleResetMs = config.get("HUB_STALE_RESET_MS", { infer: true });
  }

  onApplicationBootstrap() { void this.loop(); }

  private async loop() {
    let last = "$";                                        // chỉ lấy tin mới từ lúc khởi động
    while (this.running) {
      try {
        const res = (await this.conn.xread(
          "COUNT", 1000, "BLOCK", 5000, "STREAMS", TICK_STREAM, last,
        )) as [string, StreamEntry[]][] | null;
        if (!res) continue;
        for (const [id, f] of res[0][1]) {
          last = id;
          const { item_id, tick } = fieldsToObject(f);
          if (typeof item_id !== "string" || typeof tick !== "string") continue;
          await this.handleTick(item_id, tick);
        }
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(1000);
      }
    }
  }

  private async handleTick(itemId: string, tickJson: string): Promise<void> {
    let tick: { ts?: unknown; data?: Record<string, unknown> };
    try { tick = JSON.parse(tickJson); } catch { tick = {}; }
    const pos = payloadPosition(tick?.data);
    const fns = this.listeners.get(itemId);

    // Không đọc được shoe/round (vd trang demo /live): chuyển tiếp như cũ, không lọc, không round_result.
    if (!pos) {
      if (fns?.size) this.emit(fns, await this.withStreamId(itemId, tickJson));
      return;
    }

    const now = Date.now();
    let st = this.states.get(itemId);
    let accepted: boolean;
    if (!st) {
      st = { ctx: { current: pos.shoe, previous: null }, session: pos, result: null, lastTick: tickJson, lastTickAt: now, staleSince: null };
      accepted = true;
    } else {
      // 1) Con trỏ phiên trước.
      accepted = comparePosition(pos, st.session, st.ctx) >= 0;
      if (accepted) {
        st.ctx = advanceShoe(st.ctx, pos.shoe);
        st.session = pos;
        st.lastTick = tickJson;
        st.staleSince = null;
      } else {
        st.staleSince ??= now;
        if (now - st.staleSince >= this.staleResetMs) {
          // Tự phục hồi: không thể đứng hình mãi nếu nguồn đổi hẳn vị trí (vd shoe cũ quay lại); tick kế tiếp khởi tạo lại.
          this.states.delete(itemId);
          this.log.warn(
            `Hub: stream ${itemId} chỉ nhận tick cũ hơn phiên (shoe ${st.session.shoe}, round ${st.session.round}) trong ` +
            `${now - st.staleSince}ms, tick gần nhất shoe ${pos.shoe} round ${pos.round} ⇒ xóa state, tick kế tiếp khởi tạo lại`);
          return;
        }
      }
    }
    st.lastTickAt = now;
    this.touch(itemId, st);

    // 2) Rồi mới xét kết quả (kể cả khi tick bị bỏ: tick muộn có thể mang kết quả của ván trước chưa phát).
    const raw = tick.data?.actual_result;
    const result = typeof raw === "string" ? raw.trim() : null;
    let roundResult: Omit<RealtimeRoundResult, "stream_id"> | null = null;
    if (result !== null && OUTCOMES.includes(result) && (st.result === null || comparePosition(pos, st.result, st.ctx) > 0)) {
      st.result = pos;
      roundResult = {
        type: "round_result", item_id: itemId, shoe: pos.shoe, round: pos.round, result,
        ts: typeof tick.ts === "number" ? tick.ts : now / 1000,
      };
    }

    if (!fns?.size || (!accepted && !roundResult)) return;
    const streamId = await this.streamIdOf(itemId);
    if (accepted) this.emit(fns, this.tickEvent(tickJson, streamId));
    if (roundResult) this.emit(fns, JSON.stringify({ ...roundResult, stream_id: streamId }));
  }

  /** Đưa stream xuống cuối thứ tự LRU; quá HUB_STATE_MAX thì bỏ stream lâu không có tick nhất (log WARN). */
  private touch(itemId: string, st: StreamState) {
    this.states.delete(itemId);
    this.states.set(itemId, st);
    while (this.states.size > HUB_STATE_MAX) {
      const [oldId, old] = this.states.entries().next().value as [string, StreamState];
      this.states.delete(oldId);
      this.log.warn(`Hub: quá ${HUB_STATE_MAX} stream, bỏ state của ${oldId} (không có tick ${Math.round((Date.now() - old.lastTickAt) / 1000)}s)`);
    }
  }

  private emit(fns: Set<Listener>, json: string) {
    fns.forEach((fn) => fn(json));
  }

  /** Snapshot cho kết nối mới: tick cuối hub đã chấp nhận; null khi hub chưa có state (vừa restart) ⇒ caller dùng latest:{key_id}. */
  async snapshot(itemId: string): Promise<string | null> {
    const st = this.states.get(itemId);
    return st ? this.tickEvent(st.lastTick, await this.streamIdOf(itemId)) : null;
  }

  private async streamIdOf(itemId: string): Promise<string | null> {
    try {
      const [streamId] = await this.ids.getMany([RedisKeys.stream(itemId)]);
      return streamId ?? null;
    } catch (e) {
      this.log.warn(`Không đọc được stream_id của ${itemId}: ${e}`);
      return null;
    }
  }

  private tickEvent(tickJson: string, streamId: string | null): string {
    try {
      return JSON.stringify({ ...JSON.parse(tickJson), type: "tick", stream_id: streamId });
    } catch {
      return tickJson;
    }
  }

  /** Gắn streams.stream_id (từ cache id) vào tick; chưa có trong cache thì null (ingestion sẽ ghi cache sau khi commit). */
  async withStreamId(itemId: string, tickJson: string): Promise<string> {
    return this.tickEvent(tickJson, await this.streamIdOf(itemId));
  }

  subscribe(itemId: string, fn: Listener): () => void {
    let set = this.listeners.get(itemId);
    if (!set) this.listeners.set(itemId, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(itemId);
    };
  }

  onModuleDestroy() {
    this.running = false;
    this.conn.disconnect();
  }
}
