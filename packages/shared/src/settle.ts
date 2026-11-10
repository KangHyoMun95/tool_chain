// Contract của stream settle:requests (api ghi, api đọc — group `settle`). Mỗi entry một field `payload` là JSON SettleRequest.
// Chỉ là tín hiệu "hãy hoàn tiền ván này": consumer tự đọc trạng thái ván trong DB, nên gửi trùng / thừa đều vô hại.
export const SETTLE_REQUEST_STREAM = "settle:requests";
export const SETTLE_STREAM_MAXLEN = 10_000;   // XADD MAXLEN ~
export const SETTLE_GROUP = "settle";

export type SettleReason = "FINISHED" | "CANCELLED";
export type SettleRequest = { game_session_id: string; reason: SettleReason };
