// src/realtime/realtime.constants.ts
export const SSE_MAX_BUFFERED_BYTES = 1_000_000;   // buffer ghi của một kết nối vượt mức này (client không đọc kịp / đã chết) ⇒ đóng PING_FAILED
export const TICKET_MAX_ITEMS = 20;                 // số key_id tối đa của một kết nối SSE
export const TICKET_ITEM_MAX_LENGTH = 300;
export const TICKET_PATTERN = /^[A-Za-z0-9_-]{32}$/;   // randomBytes(24) base64url
export const SOCKET_KEEPALIVE_MS = 10_000;
export const HUB_STATE_MAX = 1_000;                 // số stream tối đa hub giữ state phiên/kết quả; quá thì bỏ stream lâu không có tick nhất (WARN)
