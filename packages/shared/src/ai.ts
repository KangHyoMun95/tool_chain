// packages/shared/src/ai.ts
// Contract luồng dự đoán: API ↔ AI qua Redis Stream. Phải khớp apps/ai/src/patterns/contract.py
// (sửa một bên thì sửa bên kia trong cùng commit).
//
// Mỗi entry của stream có đúng một field `payload` = JSON của message (cùng quy ước field `tick` của `ticks`).
// Luồng: API → predict:requests → AI → predict:results → API; API → ai:results → AI (cập nhật bảng đếm).
export const AI_SCHEMA_VERSION = 1;

export const PREDICT_REQUEST_STREAM = "predict:requests";   // API ghi, AI đọc
export const AI_RESULT_STREAM = "ai:results";               // API ghi, AI đọc
export const PREDICT_RESULT_STREAM = "predict:results";     // AI ghi, API đọc
export const AI_STREAM_MAXLEN = 10_000;                     // XADD MAXLEN ~ cho cả 3 stream

// Consumer group (tên consumer cố định qua env, không dùng --scale)
export const PREDICT_TRIGGER_GROUP = "predict-trigger";     // API, trên `ticks`
export const PREDICT_PERSIST_GROUP = "predict-persist";     // API, trên `predict:results`
export const AI_COUNTER_GROUP = "ai-counter";               // AI, trên `ai:results`
export const AI_PREDICTOR_GROUP = "ai-predictor";           // AI, trên `predict:requests`

export const PREDICTION_MODEL_VERSION = "pattern-v1";
// Namespace UUIDv5 của prediction_id = uuid5(PREDICTION_NAMESPACE, game_session_id). TUYỆT ĐỐI không đổi.
export const PREDICTION_NAMESPACE = "d2ce63e1-76f4-498d-b5c7-67718f2a7f29";

export type Outcome = "B" | "P" | "T";
export type Pick = "B" | "P";
export type PredictionReason = "OK" | "NOT_ENOUGH_HISTORY" | "NO_ELIGIBLE_SUFFIX";

/** API → AI: có ván mới cần dự đoán. */
export type PredictRequest = {
  schema_version: 1;
  game_session_id: string;
  stream_id: string;                 // streams.stream_id (UUID DB)
  key_id: string;
  shoe: number;
  round: number;
  requested_at: string;              // ISO-8601 UTC
};

/** API → AI: ván vừa có kết quả (chỉ XADD lần đầu có kết quả của ván). */
export type AiResult = {
  schema_version: 1;
  game_session_id: string;
  stream_id: string;
  shoe: number;
  round: number;
  result: Outcome;
  received_at: string;
};

/** Một đuôi k đã xét. pct_* = null khi total = 0. */
export type PatternRow = {
  k: number;
  pattern: string;
  count_B: number;
  count_P: number;
  total: number;
  pct_B: number | null;
  pct_P: number | null;
  eligible: boolean;                 // total >= 3 và count_B != count_P
};

export type ChosenPattern = {
  k: number;
  pattern: string;
  occurrences: number;               // = total của đuôi được chọn
  pct_B: number;
  pct_P: number;
};

/** Cột predictions.detail (jsonb). */
export type PredictionDetail = {
  chosen: ChosenPattern | null;
  rows: PatternRow[];                // mọi k đã xét (3..10)
  history_used: string;              // chuỗi B/P (đã bỏ T), tối đa 10 ký tự gần nhất
  missing_previous: boolean;
};

/** AI → API: kết quả dự đoán. `detail` là PatternRow[]; API gói thành PredictionDetail khi lưu DB. */
export type PredictResult = {
  schema_version: 1;
  prediction_id: string;             // uuid5(PREDICTION_NAMESPACE, game_session_id)
  game_session_id: string;
  stream_id: string;
  key_id: string;                    // chép từ PredictRequest, để API đẩy SSE đúng phòng
  shoe: number;
  round: number;
  pick: Pick | null;
  confidence: number | null;         // tỉ lệ của pick, 0–1
  chosen: ChosenPattern | null;
  detail: PatternRow[];
  history_used: string;
  missing_previous: boolean;
  reason: PredictionReason;
  model_version: string;
  created_at: string;
};

/** Phần `data` của event SSE `type: "prediction"` (KHÔNG gồm detail đầy đủ). */
export type PredictionEvent = {
  game_session_id: string;
  stream_id: string;
  shoe: number;
  round: number;
  pick: Pick | null;
  confidence: number | null;
  chosen: ChosenPattern | null;
  reason: PredictionReason;
  created_at: string;
};
