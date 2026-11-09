// src/predictions/predictions.constants.ts
import type { StreamStatus } from "@toolhackchain/shared";

export const ROUND_STATUS_TTL_SECONDS = 60 * 60;      // round_status:{gsid}, predict_req:{gsid}
export const RECENT_TTL_SECONDS = 24 * 60 * 60;       // recent:{stream_id}:{shoe}
export const PREDICT_REQUEST_MAX_AGE_MS = 30_000;     // tick cũ hơn (theo thời gian trong ID Redis Stream) thì không phát yêu cầu
export const TRIGGER_READ_COUNT = 200;
export const TRIGGER_BLOCK_MS = 2_000;
export const TRIGGER_RETRY_DELAY_MS = 1_000;
export const TRIGGER_LOG_INTERVAL_MS = 60_000;        // log INFO/WARN lặp lại tối đa 1 lần / phút cho mỗi khóa

// Trạng thái chỉ tiến. Phải khớp bảng rank trong script advanceRoundStatus (predict-lua.ts).
export const STATUS_RANK: Record<StreamStatus, number> = {
  IN_PROGRESS: 1,
  DONE: 2,
  GET_RESULT: 3,
  SUMMARY_RESULT: 4,
};
