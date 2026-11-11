// src/predictions/predict-result.consumer.ts
// Đọc predict:results (group predict-persist): kiểm tra hạn chót -> lưu predictions + trừ tiền participant (một transaction)
// -> giao pick riêng cho user đã trừ (sau commit) -> XACK.
// Mọi bước idempotent: ván đã có prediction thì INSERT không thêm dòng, không trừ lại; chỉ giao lại cho subscription chưa giao.
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { hostname } from "os";
import {
  PREDICT_PERSIST_GROUP, PREDICT_RESULT_STREAM, RedisKeys,
  type PredictionEvent, type PredictResult, type RealtimePrediction,
} from "@toolhackchain/shared";
import { fieldsToObject, sleep, StreamEntry } from "../common/stream.util.js";
import { isDataError, pgErrorCode } from "../ingestion/dead-letter.js";
import { ConnectionRegistry } from "../realtime/connection-registry.js";
import { PredictionDeliveryService } from "./prediction-delivery.service.js";
import { predictionId } from "./prediction-id.js";
import { parsePredictResult } from "./predict-result.schema.js";
import { PredictionsService } from "./predictions.service.js";
import {
  PERSIST_HANDLE_TIMEOUT_MS, PERSIST_SLOW_WARN_MS, REDIS_COMMAND_TIMEOUT_MS, REDIS_KEEPALIVE_MS,
  TRIGGER_BLOCK_MS, TRIGGER_READ_COUNT, TRIGGER_RETRY_DELAY_MS,
} from "./predictions.constants.js";

const PG_FOREIGN_KEY_VIOLATION = "23503";   // stream_id không còn trong streams: retry vô ích

@Injectable()
export class PredictResultConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(PredictResultConsumer.name);
  private conn = new Redis(process.env.REDIS_URL!, {   // kết nối riêng vì sẽ BLOCK
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,    // lệnh treo (kết nối nửa chết) thì báo lỗi để loop thử lại thay vì kẹt vĩnh viễn
    keepAlive: REDIS_KEEPALIVE_MS,
  });
  private running = true;
  private consumer = process.env.CONSUMER_NAME ?? hostname();   // cố định qua các lần restart

  constructor(
    private predictions: PredictionsService,
    private registry: ConnectionRegistry,
    private delivery: PredictionDeliveryService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.conn.xgroup("CREATE", PREDICT_RESULT_STREAM, PREDICT_PERSIST_GROUP, "$", "MKSTREAM");
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
    let cursor = "0";           // PEL của mình trước, rồi mới ">"
    let replaying = true;

    while (this.running) {
      try {
        const res = (await this.conn.xreadgroup(
          "GROUP", PREDICT_PERSIST_GROUP, this.consumer,
          "COUNT", TRIGGER_READ_COUNT, "BLOCK", TRIGGER_BLOCK_MS,
          "STREAMS", PREDICT_RESULT_STREAM, cursor,
        )) as [string, StreamEntry[]][] | null;

        const entries = res?.[0]?.[1] ?? [];
        if (replaying && entries.length === 0) { replaying = false; cursor = ">"; continue; }
        if (entries.length === 0) continue;

        for (const [id, fields] of entries) {
          await this.handleWithTimeout(id, fields);
          await this.conn.xack(PREDICT_RESULT_STREAM, PREDICT_PERSIST_GROUP, id);   // chỉ sau khi đã xử lý xong (và commit)
          if (replaying) cursor = id;
        }
      } catch (e) {
        if (!this.running) break;
        this.log.error(e);
        await sleep(TRIGGER_RETRY_DELAY_MS);
        replaying = true;       // tin chưa ack nằm trong PEL, không được giao lại qua ">"
        cursor = "0";
      }
    }
  }

  /** Giới hạn thời gian cho một message: quá hạn ⇒ ném lỗi, loop thử lại từ PEL (insert idempotent). Query treo bị statement_timeout của pg cắt. */
  private async handleWithTimeout(id: string, fields: string[]): Promise<void> {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.handle(fields),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`predict:results ${id}: xử lý quá ${PERSIST_HANDLE_TIMEOUT_MS}ms`)), PERSIST_HANDLE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const took = Date.now() - started;
    if (took >= PERSIST_SLOW_WARN_MS) this.log.warn(`predict:results ${id}: xử lý chậm ${took}ms`);
  }

  /** Lỗi tạm thời (DB / Redis sập) ném ra để loop thử lại; message hỏng hoặc quá hạn chỉ bị bỏ qua (caller vẫn XACK). */
  private async handle(fields: string[]): Promise<void> {
    let msg: PredictResult | null = null;
    try { msg = parsePredictResult(JSON.parse(fieldsToObject(fields).payload)); } catch { /* msg = null */ }
    if (!msg) { this.log.error("predict:results: bỏ qua message không đúng contract"); return; }
    if (msg.prediction_id !== predictionId(msg.game_session_id)) {
      this.log.error(`predict:results: prediction_id không khớp game_session_id ${msg.game_session_id}, bỏ qua`);
      return;
    }

    // Hạn chót: chỉ lưu và đẩy khi ván vẫn đang IN_PROGRESS (không tồn tại cũng coi là quá hạn).
    const status = await this.conn.get(RedisKeys.roundStatus(msg.game_session_id));
    if (status !== "IN_PROGRESS") {
      this.log.log(JSON.stringify({
        event: "late_prediction", key_id: msg.key_id, stream_id: msg.stream_id, shoe: msg.shoe, round: msg.round,
        status, age_ms: Date.now() - Date.parse(msg.created_at),
      }));
      return;
    }

    // Snapshot participant ngay trước transaction: ai mở trang sau thời điểm này không bị trừ ván này (tính từ ván sau).
    const participantIds = this.registry.participantUserIds(msg.stream_id);
    let inserted: Awaited<ReturnType<PredictionsService["insertFromResult"]>>;
    try {
      inserted = await this.predictions.insertFromResult(msg, participantIds);
    } catch (e) {
      if (isDataError(e) || pgErrorCode(e) === PG_FOREIGN_KEY_VIOLATION) {
        this.log.error(`predict:results: không lưu được prediction của ${msg.game_session_id} (${pgErrorCode(e)}), bỏ qua`);
        return;
      }
      throw e;
    }
    if (!inserted) {
      // Đã có prediction (xử lý lại sau lỗi / trùng): không trừ lại; giao lại pick cho subscription chưa giao (đọc từ DB).
      const data = await this.predictions.eventData(msg.prediction_id);
      if (data?.pick) {
        const r = await this.delivery.deliverPaid(msg.prediction_id, this.event(msg.key_id, data));
        if (r.due > 0) this.log.log(`Giao lại prediction ${msg.key_id} shoe ${msg.shoe}, round ${msg.round}: ${r.delivered}/${r.due} user`);
      }
      return;
    }
    const { createdAt, charge } = inserted;
    const event = this.event(msg.key_id, {
      game_session_id: msg.game_session_id, stream_id: msg.stream_id, shoe: msg.shoe, round: msg.round,
      pick: msg.pick, confidence: msg.confidence, chosen: msg.chosen, reason: msg.reason, created_at: createdAt.toISOString(),
    });

    if (msg.pick === null) {
      // AI không dự đoán: không ai bị trừ, báo cho mọi participant.
      const n = this.delivery.deliverUnpaid(event);
      // pick = null: không ai bị trừ tiền ⇒ DEBUG (API_LOG_DEBUG=true mới in).
      this.log.debug(`Prediction ${msg.key_id} shoe ${msg.shoe}, round ${msg.round}: ${msg.reason} (${n} kết nối)`);
      return;
    }

    // Có pick: chỉ user đã trừ tiền nhận pick (lọc ở server). Participant không trừ được thì bị đóng kết nối.
    if (charge) this.delivery.closeRejected(msg.stream_id, charge.rejected);
    const r = await this.delivery.deliverPaid(msg.prediction_id, event);
    // Không có participant (không ai bị trừ, không ai được giao) ⇒ DEBUG.
    const quiet = charge?.skipped === "NO_PARTICIPANTS" || (r.due === 0 && (charge?.charged.length ?? 0) === 0 && (charge?.rejected.length ?? 0) === 0);
    (quiet ? this.log.debug.bind(this.log) : this.log.log.bind(this.log))(
      `Prediction ${msg.key_id} shoe ${msg.shoe}, round ${msg.round}: ${msg.pick}; ` +
      `trừ ${charge?.charged.length ?? 0} user, không trừ được ${charge?.rejected.length ?? 0}` +
      `${charge?.skipped ? ` (${charge.skipped})` : ""}, giao ${r.delivered}/${r.due}`);
  }

  private event(keyId: string, data: PredictionEvent): RealtimePrediction {
    return { type: "prediction", item_id: keyId, ts: Date.parse(data.created_at) / 1000, stream_id: data.stream_id, data };
  }
}
