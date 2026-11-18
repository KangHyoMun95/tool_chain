// Cấu hình kết quả của category (từ config/categories/*.json, API trả kèm GET /streams/:id): ký hiệu, nhãn vi/en, màu, draw, totals.
// Portal KHÔNG hardcode B/P/T: hạt, nhãn, màu, "hòa", khung tỉ lệ đều đọc từ đây.
import type { ResultConfig } from "@toolhackchain/shared";
import type { Locale } from "@/src/i18n/config";

export type { ResultConfig };
export type Tone = "win" | "loss" | "draw" | "none";

const UNKNOWN_COLOR = "#6b7280";

export type SymbolView = { label: string; color: string; known: boolean };

/** Nhãn (theo ngôn ngữ) + màu của một ký hiệu; ký hiệu ngoài cấu hình ⇒ xám, nhãn = chính ký hiệu. */
export function symbolView(config: ResultConfig | null, symbol: string, locale: Locale): SymbolView {
  const def = config && Object.hasOwn(config.results, symbol) ? config.results[symbol] : null;
  if (!def) return { label: symbol, color: UNKNOWN_COLOR, known: false };
  return { label: locale === "vi" ? def.label.vi : def.label.en, color: def.color, known: true };
}

/** Kết quả thuộc `draw` của category (hiển thị là "hòa"). */
export const isDraw = (config: ResultConfig | null, result: string | null): boolean =>
  result !== null && !!config && config.draw.includes(result);

/**
 * Đúng / sai / hòa của một ván: kết quả thuộc draw ⇒ hòa (cả khi AI không có pick); chưa có pick hoặc chưa có kết quả ⇒ none;
 * pick = result ⇒ win; còn lại loss.
 */
export function resultTone(config: ResultConfig | null, pick: string | null, result: string | null): Tone {
  if (result === null) return "none";
  if (isDraw(config, result)) return "draw";
  if (pick === null) return "none";
  return pick === result ? "win" : "loss";
}

/** Màu chữ (đen / trắng) đọc được trên nền `hex` (#RRGGBB). */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#000000" : "#ffffff";
}

/** Bóng sáng cùng màu (hex + alpha 8 bit). */
export const glow = (hex: string, px = 8, alpha = 0.7): string =>
  `0 0 ${px}px ${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
