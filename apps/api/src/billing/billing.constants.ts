// src/billing/billing.constants.ts
export const CANCEL_JOB_INTERVAL_MS = 60_000;      // job hủy ván chạy mỗi phút
export const CANCEL_BATCH_LIMIT = 1_000;           // số ván tối đa bị CANCELLED mỗi lần chạy (lần đầu có thể còn nhiều ván cũ)
export const SWEEP_INTERVAL_MS = 60_000;           // sweeper hoàn tiền chạy mỗi phút
export const SWEEP_MIN_AGE_MS = 2 * 60_000;        // chỉ quét ván đã FINISHED / CANCELLED hơn 2 phút
export const SWEEP_LOOKBACK_DAYS = 7;              // chỉ xét subscription tạo trong khoảng này (subscription thắng không bao giờ được hoàn)
export const SWEEP_BATCH_LIMIT = 500;
export const SETTLE_REQ_DEDUPE_SECONDS = 300;      // settle_req:{gsid} NX EX: sweeper không gửi lại cùng ván trong 5 phút
export const SETTLE_READ_COUNT = 100;
export const SETTLE_BLOCK_MS = 2_000;
export const SETTLE_RETRY_DELAY_MS = 1_000;
export const SETTLE_HANDLE_TIMEOUT_MS = 15_000;    // giống predict-persist: quá hạn thì ném lỗi, đọc lại PEL
export const SETTLE_SLOW_WARN_MS = 3_000;
