'use client';

// Lịch lucky time của lobby NỔ HŨ (HOST): GET /lucky-time, POST /lucky-time/import, danh sách game = GET /categories?lobby_id=NO_HU_LOBBY_ID.
// Mỗi dòng thuộc đúng một category (không có lịch dùng chung). Khóa theo category_id, tên chỉ để hiển thị / nhập trong file.
import { useQuery } from '@tanstack/react-query';
import { NO_HU_LOBBY_ID, type LuckyTimeIssue, type LuckyTimeRow } from '@toolhackchain/shared';
import { ApiError, apiFetch } from './client';

export interface NoHuCategory { id: string; name: string }

/** Giá trị bộ lọc: null = "Tất cả" = xem mọi category của lobby (không phải dữ liệu dùng chung). */
export type CategoryFilter = string | null;

export interface LuckyTimeItem extends Omit<LuckyTimeRow, 'game'> {
  lucky_time_id: string;
  category_id: string;
  category_name: string;
}

/** Category của lobby NỔ HŨ (dropdown lọc, tên hợp lệ của cột "Tên game" trong file import). */
export function useNoHuCategories() {
  return useQuery({
    queryKey: ['no-hu-categories'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NoHuCategory[]> => {
      const res = await apiFetch<{ items: { category_id: string; category_name: string }[] }>(
        `/categories?lobby_id=${NO_HU_LOBBY_ID}&limit=100`);
      return res.items.map((c) => ({ id: c.category_id, name: c.category_name }));
    },
  });
}

/** Lịch đang hiệu lực (replaced_at IS NULL) của một category, hoặc của mọi category khi `category` = null. */
export async function fetchLuckyTimes(category: CategoryFilter): Promise<LuckyTimeItem[]> {
  const q = category ? `?category_id=${category}` : '';
  return (await apiFetch<{ items: LuckyTimeItem[] }>(`/lucky-time${q}`)).items;
}

export interface ImportResult { categories: number; rows: number; replaced: number }

/** Lỗi 400 IMPORT_INVALID: server đọc lại file và còn dòng lỗi; chưa ghi gì. */
export class LuckyTimeImportError extends Error {
  constructor(readonly issues: LuckyTimeIssue[], readonly totalIssues: number) {
    super('File lịch lucky time không hợp lệ');
  }
}

/**
 * Gửi chính file đã chọn; server tự đọc và kiểm tra lại (không tin kết quả xem trước ở trình duyệt). Với MỖI game có trong file, lịch đang
 * hiệu lực của game đó được thay (replaced_at = now() rồi thêm dòng mới); game không có trong file giữ nguyên.
 */
export async function importLuckyTimeFile(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  try {
    return await apiFetch<ImportResult>('/lucky-time/import', { method: 'POST', body: form });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'IMPORT_INVALID') {
      const b = e.body as { issues?: LuckyTimeIssue[]; total_issues?: number };
      throw new LuckyTimeImportError(b.issues ?? [], b.total_issues ?? b.issues?.length ?? 0);
    }
    throw e;
  }
}

// ---- Định dạng hiển thị (dùng chung hai trang) ----
export const formatConfidence = (v: number | null) => (v === null ? '—' : `${v}%`);
export const formatCircle = (r: Pick<LuckyTimeRow, 'circle_est_from' | 'circle_est_to'>) => `${r.circle_est_from} - ${r.circle_est_to} vòng`;
export const formatRange = (r: Pick<LuckyTimeRow, 'range_lucky_time_from' | 'range_lucky_time_to' | 'trace_next_circle'>) =>
  r.range_lucky_time_from !== null && r.range_lucky_time_to !== null
    ? `${r.range_lucky_time_from} - ${r.range_lucky_time_to} phút`
    : r.trace_next_circle !== null ? `${r.trace_next_circle} vòng tiếp theo` : '—';
export const formatRtp = (v: number | null) => (v === null ? '—' : `${v}%`);
