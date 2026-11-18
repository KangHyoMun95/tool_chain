// packages/shared/src/category-config.ts
// Cấu hình kết quả của một category, đọc từ config/categories/*.json (api và ai nạp lúc khởi động, kiểm tra nghiêm ngặt).
// Bản kiểm tra (zod) nằm ở apps/api/src/category-config/, bản Python (pydantic) ở apps/ai/src/patterns/ — CÙNG MỘT BỘ LUẬT.
import { normalizeName } from "./realtime";

/** Ký hiệu kết quả: đúng một chữ in hoa (^[A-Z]$). Cũng là định dạng của predictions.predict_result (CHECK ở DB). */
export const RESULT_SYMBOL_RE = /^[A-Z]$/;
/** Màu hiển thị: #RRGGBB. */
export const RESULT_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export type ResultLabel = { vi: string; en: string };
export type ResultDef = { label: ResultLabel; color: string };

/** Nội dung một file config/categories/*.json (đã kiểm tra). */
export type CategoryConfig = {
  lobby: string;
  category: string;
  results: Record<string, ResultDef>;   // mọi ký hiệu kết quả hợp lệ
  predictable: string[];                // AI được chọn làm pick (không rỗng)
  ignore_in_pattern: string[];          // AI bỏ qua khi dựng chuỗi
  draw: string[];                       // hiển thị / thống kê là "hòa" (không ảnh hưởng tiền)
  totals: string[];                     // ký hiệu hiển thị trong khung tỉ lệ (số lấy từ tick.totals)
};

/** Phần cấu hình trả cho portal (không có ignore_in_pattern: chỉ AI dùng). */
export type ResultConfig = Pick<CategoryConfig, "results" | "predictable" | "draw" | "totals">;

/** Khóa tra cấu hình theo tên lobby + category (đã chuẩn hóa như key_id). */
export const categoryConfigKey = (lobby: string, category: string): string =>
  `${normalizeName(lobby)}|${normalizeName(category)}`;
