// src/ingestion/ingestion.constants.ts
export const MAX_BATCH = 2000;          // xả khi đủ số dòng này
export const MAX_WAIT_MS = 10_000;      // hoặc khi tick cũ nhất đã chờ chừng này
export const RETRY_DELAY_MS = 1000;     // chờ trước khi thử lại khi ghi DB lỗi

export const ID_CACHE_TTL_SECONDS = 30 * 60;   // cache id lobby / category / stream trên Redis
export const MEMORY_CACHE_MAX = 100_000;            // số mục tối đa mỗi cache trong bộ nhớ
export const MAX_NAME_LENGTH = 255;                 // theo cột *_name / streamer_id
export const MAX_RESULT_LENGTH = 50;                // theo cột game_sessions.result
