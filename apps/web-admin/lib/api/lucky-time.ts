// Lịch lucky time của lobby NỔ HŨ (HOST). CHƯA CÓ API: dữ liệu giả + hàm stub. Khi API xong chỉ thay phần thân các hàm / hook ở file này.
import type { LuckyTimeRow } from '@toolhackchain/shared';

/**
 * TẠM THỜI: danh sách category của lobby NỔ HŨ viết cứng để dựng giao diện.
 * Sẽ lấy từ API (GET /categories?lobby_id=NO_HU_LOBBY_ID). `id` ở đây là GIÁ TRỊ GIẢ, KHÔNG phải category_id thật:
 * không dùng tên làm khóa lâu dài, khi có API phải khóa theo category_id (UUID).
 */
export const TEMP_NO_HU_CATEGORIES = [
  { id: 'temp-kho-bau-aztec', name: 'Kho báu Aztec' },
  { id: 'temp-sieu-at', name: 'Siêu át' },
  { id: 'temp-de-quoc-hoang-gia', name: 'Đế quốc hoàng gia' },
  { id: 'temp-meo-may-man', name: 'Mèo may mắn' },
  { id: 'temp-ngoc-may-man-3', name: 'Ngọc may mắn 3' },
  { id: 'temp-quyet-chien-tien-thuong', name: 'Quyết chiến tiền thưởng' },
  { id: 'temp-ngoc-may-man-2', name: 'Ngọc may mắn 2' },
  { id: 'temp-duong-mat-chuoc', name: 'Đường mạt chược' },
  { id: 'temp-phi-cong', name: 'Phi công' },
  { id: 'temp-fortune-tiger', name: 'Fortune Tiger' },
  { id: 'temp-gates-of-olympus', name: 'Gates of Olympus' },
] as const;

/** Giá trị bộ lọc / dropdown: null = "Tất cả" (dùng chung cho mọi category của lobby, category_id NULL trong DB). */
export type CategoryFilter = string | null;

export interface LuckyTimeItem extends Omit<LuckyTimeRow, 'game'> {
  lucky_time_id: string;
  category_id: string | null;
}

// ---- Dữ liệu giả (xác định, không ngẫu nhiên) ----
const INDICATORS = ['Đang tăng', 'Ổn định', 'Đang giảm', 'Biến động mạnh'];

function fakeRows(categoryId: string | null, count: number, seed: number): LuckyTimeItem[] {
  return Array.from({ length: count }, (_, i) => {
    const minutes = (i * 97 + seed * 31) % 1440;
    const next = (i + seed) % 3 === 0;
    return {
      lucky_time_id: `fake-${categoryId ?? 'all'}-${i}`,
      category_id: categoryId,
      time_lucky: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      confidence: 55 + ((i * 7 + seed) % 45),
      indicator: INDICATORS[(i + seed) % INDICATORS.length],
      circle_est_from: 10 + (i % 4) * 5,
      circle_est_to: 20 + (i % 4) * 5,
      range_lucky_time_from: next ? null : 1 + (i % 3),
      range_lucky_time_to: next ? null : 4 + (i % 3),
      trace_next_circle: next ? 3 + (i % 5) : null,
      fluctuations_rtp: Number((55.4 + ((i * 13 + seed * 7) % 450) / 10).toFixed(2)),
    };
  });
}

/** TẠM THỜI: thay bằng GET lịch đang hiệu lực (replaced_at IS NULL) của category. */
export async function fetchLuckyTimes(category: CategoryFilter): Promise<LuckyTimeItem[]> {
  const seed = category === null ? 1 : TEMP_NO_HU_CATEGORIES.findIndex((c) => c.id === category) + 2;
  return fakeRows(category, 14, seed);
}

export class LuckyTimeApiNotReadyError extends Error {
  constructor() {
    super('Chưa có API import lucky time. Chức năng sẽ hoạt động khi API được triển khai.');
    this.name = 'LuckyTimeApiNotReadyError';
  }
}

/**
 * STUB: sẽ gọi POST import. Mỗi dòng mang `game` (tên category, null = dùng chung); API đổi tên sang category_id và, với MỖI game có trong file,
 * thay lịch đang hiệu lực của game đó (replaced_at = now() rồi thêm dòng mới; null = chỉ thay dòng dùng chung); game không có trong file giữ nguyên.
 * Hiện luôn ném LuckyTimeApiNotReadyError.
 */
export async function importLuckyTimes(_rows: LuckyTimeRow[]): Promise<void> {
  throw new LuckyTimeApiNotReadyError();
}

// ---- Định dạng hiển thị (dùng chung hai trang) ----
export const formatConfidence = (v: number | null) => (v === null ? '—' : `${v}%`);
export const formatCircle = (r: Pick<LuckyTimeRow, 'circle_est_from' | 'circle_est_to'>) => `${r.circle_est_from} - ${r.circle_est_to} vòng`;
export const formatRange = (r: Pick<LuckyTimeRow, 'range_lucky_time_from' | 'range_lucky_time_to' | 'trace_next_circle'>) =>
  r.range_lucky_time_from !== null && r.range_lucky_time_to !== null
    ? `${r.range_lucky_time_from} - ${r.range_lucky_time_to} phút`
    : r.trace_next_circle !== null ? `${r.trace_next_circle} vòng tiếp theo` : '—';
export const formatRtp = (v: number | null) => (v === null ? '—' : `${v}%`);
