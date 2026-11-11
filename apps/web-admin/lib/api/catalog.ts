import type { CatalogStatus } from '@toolhackchain/shared';
import { apiFetch } from './client';

/** Một dòng của GET /streams (snake_case, id là UUID). */
export interface StreamRow {
  stream_id: string;
  stream_name: string;
  category_id: string;
  category_name: string;
  lobby_id: string;
  lobby_name: string;
  streamer_id: string | null;
  status: CatalogStatus;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface StreamQuery {
  page: number;
  limit: number;
  q?: string;
  status?: CatalogStatus;
}

/** GET /streams: HOST / ADMIN thấy mọi trạng thái và lọc được theo status. */
export function fetchStreams(query: StreamQuery): Promise<Page<StreamRow>> {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.status) params.set('status', query.status);
  return apiFetch<Page<StreamRow>>(`/streams?${params.toString()}`);
}
