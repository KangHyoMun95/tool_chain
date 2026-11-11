// src/predictions/predict-trigger.service.ts
// Đọc `ticks` bằng consumer group riêng (predict-trigger) để:
//   1) theo dõi trạng thái mới nhất của từng ván (round_status),
//   2) ghi kết quả vào recent:{stream_id}:{shoe} và phát ai:results (lần đầu có kết quả của ván),
//   3) phát predict:requests (lần đầu thấy IN_PROGRESS của ván).
// Chạy độc lập với TickPersister (ghi DB theo batch) và RealtimeHub (SSE). Mọi bước idempotent nên replay an toàn.
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { hostname } from "os";
import {
  AI_RESULT_STREAM, AI_SCHEMA_VERSION, AI_STREAM_MAXLEN, PREDICT_REQUEST_STREAM, PREDICT_TRIGGER_GROUP,
  RedisKeys, STREAM_STATUSES, TICK_STREAM,
  type AiResult, type Outcome, type PredictRequest, type StreamStatus, type Tick,
} from "@toolhackchain/shared";
import { buildKeyId } from "../common/normalize.js";
import { fieldsToObject, sleep, StreamEntry } from "../common/stream.util.js";
import { toInt } from "../common/to-int.js";
import { gameSessionId } from "../game-sessions/game-session-id.js";
import { BoundedMap } from "../ingestion/bounded-map.js";
import { IdCache } from "../ingestion/id-cache.service.js";
import { MEMORY_CACHE_MAX } from "../ingestion/ingestion.constants.js";
import { PredictRedis, withPredictCommands } from "./predict-lua.js";
import {
  PREDICT_REQUEST_MAX_AGE_MS, RECENT_TTL_SECONDS, ROUND_STATUS_TTL_SECONDS, STATUS_RANK,
  TRIGGER_BLOCK_MS, TRIGGER_LOG_INTERVAL_MS, TRIGGER_READ_COUNT, TRIGGER_RETRY_DELAY_MS,
} from "./predictions.constants.js";

const OUTCOMES: readonly string[] = ["B", "P", "T"];

/** Những gì process này đã làm cho một ván, để tick lặp lại (nhiều tick / ván) không phải chạm Redis. */
type SessionState = { status: StreamStatus | null; resultSent: boolean; requestDone: boolean };

const rank = (s: StreamStatus | null): number => (s ? STATUS_RANK[s] : 0);
const isStatus = (v: unknown): v is StreamStatus => typeof v === "string" && (STREAM_STATUSES as readonly string[]).includes(v);

@Injectable()
export class PredictTriggerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(PredictTriggerService.name);
  private conn: PredictRedis = withPredictCommands(new Redis(process.env.REDIS_URL!));   // kết nối riêng vì sẽ BLOCK
  private running = true;
  private consumer = process.env.CONSUMER_NAME ?? hostname();   // cố định qua các lần restart
  private sessions = new BoundedMap<string, SessionState>(MEMORY_CACHE_MAX);
  private lastLog = new BoundedMap<string, number>(MEMORY_CACHE_MAX);

  constructor(private ids: IdCache) {}

  async onApplicationBootstrap() {
    try {
      // "$": group mới chỉ nhận tick từ bây giờ. Tạo ở "0" sẽ replay cả lịch sử `ticks` và phát ai:results cho ván cũ.
      await this.conn.xgroup("CREATE", TICK_STREAM, PREDICT_TRIGGER_GROUP, "$", "MKSTREAM");
    } catch (e) {
      if (!String(e).includes("BUSYGROUP")) throw e;
    }
    void this.loop();
  }

  onModuleDestroy() {
    this.running = false;
    this.conn.disconnect();
  }

  private async loop() {
    // "0" = xử lý nốt tin chưa ack của mình (PEL), rồi mới đọc tin mới ">".
    let cursor = "0";
    let replaying = true;

    while (this.running) {
      try {
        const res = (await this.conn.xreadgroup(
          "GROUP", PREDICT_TRIGGER_GROUP, this.consumer,
          "COUNT", TRIGGER_READ_COUNT, "BLOCK", TRIGGER_BLOCK_MS,
          "STREAMS", TICK_STREAM, cursor,
        )) as [string, StreamEntry[]][] | null;

        const entries = res?.[0]?.[1] ?? [];
        if (replaying && entries.length === 0) { replaying = false; cursor = ">"; continue; }
        if (entries.length === 0) continue;

        for (const [id, fields] of entries) {
          await this.handle(id, fields);
          if (replaying) cursor = id;
        }
        await this.conn.xack(TICK_STREAM, PREDICT_TRIGGER_GROUP, ...entries.map(([id]) => id));
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(TRIGGER_RETRY_DELAY_MS);
        // Tin đã đọc nhưng chưa ack nằm trong PEL, sẽ không được giao lại qua ">" → đọc lại PEL.
        replaying = true;
        cursor = "0";
      }
    }
  }

  /** Lỗi Redis ném ra ngoài (để loop thử lại); tick hỏng chỉ bị bỏ qua. */
  private async handle(entryId: string, fields: string[]): Promise<void> {
    // Mọi nhánh bỏ qua đều log (logOnce: tối đa 1 dòng / phút / khóa). Nhánh trùng lặp bình thường (đã gửi kết quả / request,
    // status không tiến) thì không log vì mỗi ván có hàng chục tick.
    const { item_id: itemId, tick: rawTick } = fieldsToObject(fields);
    let tick: Tick;
    try { tick = JSON.parse(rawTick) as Tick; } catch {
      this.logOnce(`badjson:${itemId}`, "info", `Bỏ qua tick ${entryId} của ${itemId}: không parse được JSON`);
      return;
    }
    const d = tick?.data as Record<string, unknown> | undefined;
    if (!d || typeof d !== "object" || Array.isArray(d)) {
      this.logOnce(`nodata:${itemId}`, "info", `Bỏ qua tick ${entryId} của ${itemId}: data không phải object`);
      return;
    }

    // Cùng cách ingestion sinh key_id / game_session_id, để ID khớp với bản ghi game_sessions.
    const names = [d.lobby_name, d.category_name, d.stream_name];
    if (!names.every((n): n is string => typeof n === "string" && n.trim() !== "" && !n.includes("|"))) {
      this.logOnce(`badname:${itemId}`, "info", `Bỏ qua tick ${entryId} của ${itemId}: lobby/category/stream_name thiếu, rỗng hoặc chứa "|"`);
      return;
    }
    const keyId = buildKeyId(names[0], names[1], names[2]);
    const shoe = toInt(d.stream_shoe);
    const round = toInt(d.stream_round);
    if (shoe === null || round === null) {
      this.logOnce(`badpos:${keyId}`, "info",
        `Bỏ qua tick ${entryId} của ${keyId}: stream_shoe "${String(d.stream_shoe)}" / stream_round "${String(d.stream_round)}" không phải số nguyên`);
      return;
    }
    const gsid = gameSessionId(keyId, shoe, round);

    const firstSeen = !this.sessions.has(gsid);
    const st = this.sessions.get(gsid) ?? { status: null, resultSent: false, requestDone: false };
    this.sessions.set(gsid, st);
    const status = isStatus(d.status) ? d.status : null;
    if (!status) {
      this.logOnce(`badstatus:${keyId}`, "info",
        `Tick ${keyId} shoe ${shoe}, round ${round} có status lạ "${String(d.status)}": không cập nhật round_status, không gửi yêu cầu dự đoán`);
    }

    // 1) Trạng thái mới nhất của ván (chỉ tiến). Ghi TRƯỚC khi XADD để AI đọc thấy dữ liệu mới nhất.
    if (status && rank(status) > rank(st.status)) {
      st.status = (await this.conn.advanceRoundStatus(
        RedisKeys.roundStatus(gsid), status, ROUND_STATUS_TTL_SECONDS,
      )) as StreamStatus;
    }

    // 2) Kết quả: lưu vào recent + phát ai:results trong một script (chỉ lần đầu có kết quả của ván).
    if (d.actual_result !== null && d.actual_result !== undefined && !st.resultSent) {
      const result = typeof d.actual_result === "string" ? d.actual_result.trim() : "";
      if (!OUTCOMES.includes(result)) {
        this.logOnce(`badres:${keyId}`, "warn", `Bỏ qua kết quả "${String(d.actual_result)}" của ${keyId} (shoe ${shoe}, round ${round}): không phải B/P/T`);
      } else {
        const streamId = await this.streamId(keyId);
        if (!streamId) {
          this.logOnce(`nostream:${keyId}`, "info", `Chưa có stream_id của ${keyId} trong cache id, chưa ghi kết quả shoe ${shoe}, round ${round}`);
        } else {
          const msg: AiResult = {
            schema_version: AI_SCHEMA_VERSION, game_session_id: gsid, stream_id: streamId,
            shoe, round, result: result as Outcome, received_at: new Date().toISOString(),
          };
          await this.conn.recordResult(
            RedisKeys.recent(streamId, shoe), AI_RESULT_STREAM,
            String(round), result, RECENT_TTL_SECONDS, AI_STREAM_MAXLEN, JSON.stringify(msg),
          );
          st.resultSent = true;
        }
      }
    }

    // 3) Yêu cầu dự đoán: lần đầu thấy IN_PROGRESS của ván.
    if (status === "IN_PROGRESS" && !st.requestDone) {
      if (st.status !== "IN_PROGRESS") {
        st.requestDone = true;   // ván đã sang DONE trở đi (tick IN_PROGRESS đến muộn): đã quá hạn
        this.logOnce(`late:${gsid}`, "info", `Không gửi yêu cầu dự đoán ${keyId} shoe ${shoe}, round ${round}: ván đã ở trạng thái ${st.status}`);
      } else if (Date.now() - Number(entryId.split("-")[0]) > PREDICT_REQUEST_MAX_AGE_MS) {
        // Chỉ bước này bị bỏ qua khi replay tick cũ; không đánh dấu requestDone để tick mới hơn của ván vẫn có thể phát yêu cầu.
        this.logOnce(`old:${gsid}`, "info", `Không gửi yêu cầu dự đoán ${keyId} shoe ${shoe}, round ${round}: tick quá cũ (replay)`);
      } else {
        const streamId = await this.streamId(keyId);
        if (!streamId) {
          this.logOnce(`nostream:${keyId}`, "info", `Chưa có stream_id của ${keyId} trong cache id, chưa gửi yêu cầu dự đoán shoe ${shoe}, round ${round}`);
        } else {
          const msg: PredictRequest = {
            schema_version: AI_SCHEMA_VERSION, game_session_id: gsid, stream_id: streamId,
            key_id: keyId, shoe, round, requested_at: new Date().toISOString(),
          };
          const sent = await this.conn.requestPrediction(
            RedisKeys.predictReq(gsid), PREDICT_REQUEST_STREAM, ROUND_STATUS_TTL_SECONDS, AI_STREAM_MAXLEN, JSON.stringify(msg),
          );
          st.requestDone = true;
          if (sent) this.log.log(`Yêu cầu dự đoán: ${keyId} shoe ${shoe}, round ${round}`);
          else this.logOnce(`reqdup:${gsid}`, "info", `Không gửi lại yêu cầu dự đoán ${keyId} shoe ${shoe}, round ${round}: đã có cờ predict_req (đã gửi trước đó, vd trước khi restart)`);
        }
      }
    } else if (firstSeen && status && status !== "IN_PROGRESS") {
      this.logOnce(`late:${gsid}`, "info", `Tick đầu tiên của ${keyId} shoe ${shoe}, round ${round} đã ở trạng thái ${status}: không gửi yêu cầu dự đoán`);
    }
  }

  private async streamId(keyId: string): Promise<string | undefined> {
    const [id] = await this.ids.getMany([RedisKeys.stream(keyId)]);
    return id;
  }

  private logOnce(key: string, level: "info" | "warn", message: string) {
    const now = Date.now();
    if (now - (this.lastLog.get(key) ?? 0) < TRIGGER_LOG_INTERVAL_MS) return;
    this.lastLog.set(key, now);
    if (level === "warn") this.log.warn(message); else this.log.log(message);
  }
}
