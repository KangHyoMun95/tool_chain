'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export type PredictionOutcome = 'WIN' | 'LOSE' | 'DRAW';

export interface PredictionHistoryRow {
  key: string;
  time: string;
  lobbyName: string;
  categoryName: string;
  streamName: string;
  gameShoe: number;
  gameRound: number;
  outcome: PredictionOutcome;
}

export interface PredictionHistoryStats {
  totalWin: number;
  totalLose: number;
  totalDraw: number;
  /** 0..1, null khi chưa có ván thắng / thua (hòa không tính). */
  winRate: number | null;
}

export interface PredictionHistoryFilter {
  from?: string;
  to?: string;
  lobbyId?: string;
  categoryId?: string;
  streamId?: string;
  gameShoe?: number;
  gameRound?: number;
}

export interface PredictionFilterOptions {
  lobbies: { id: string; name: string }[];
  categories: { id: string; name: string; lobbyId: string }[];
  streams: { id: string; name: string; categoryId: string }[];
}

interface ItemDto {
  time: string; lobby_name: string; category_name: string; stream_name: string;
  game_shoe: number; game_round: number; outcome: PredictionOutcome;
}
interface PageDto {
  items: ItemDto[]; total: number;
  stats: { total_win: number; total_lose: number; total_draw: number; win_rate: number | null };
}
interface FiltersDto {
  lobbies: { lobby_id: string; lobby_name: string }[];
  categories: { category_id: string; category_name: string; lobby_id: string }[];
  streams: { stream_id: string; stream_name: string; category_id: string }[];
}

const base = (userId: string) => `/admin/users/${userId}/prediction-history`;

/** Một trang lịch sử + thống kê của TOÀN BỘ dữ liệu đã lọc (không phụ thuộc trang). */
export async function fetchPredictionHistory(
  userId: string, page: number, limit: number, f: PredictionHistoryFilter,
): Promise<{ rows: PredictionHistoryRow[]; total: number; stats: PredictionHistoryStats }> {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.lobbyId) p.set('lobby_id', f.lobbyId);
  if (f.categoryId) p.set('category_id', f.categoryId);
  if (f.streamId) p.set('stream_id', f.streamId);
  if (f.gameShoe !== undefined) p.set('game_shoe', String(f.gameShoe));
  if (f.gameRound !== undefined) p.set('game_round', String(f.gameRound));
  const res = await apiFetch<PageDto>(`${base(userId)}?${p}`);
  return {
    rows: res.items.map((r, i) => ({
      key: `${r.time}|${r.stream_name}|${r.game_shoe}|${r.game_round}|${i}`,
      time: r.time, lobbyName: r.lobby_name, categoryName: r.category_name, streamName: r.stream_name,
      gameShoe: r.game_shoe, gameRound: r.game_round, outcome: r.outcome,
    })),
    total: res.total,
    stats: {
      totalWin: res.stats.total_win, totalLose: res.stats.total_lose,
      totalDraw: res.stats.total_draw, winRate: res.stats.win_rate,
    },
  };
}

/** Sảnh / game / bàn mà user có dữ liệu (cho dropdown lọc). */
export function usePredictionFilterOptions(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['prediction-history-filters', userId],
    enabled: enabled && !!userId,
    queryFn: async (): Promise<PredictionFilterOptions> => {
      const r = await apiFetch<FiltersDto>(`${base(userId)}/filters`);
      return {
        lobbies: r.lobbies.map((l) => ({ id: l.lobby_id, name: l.lobby_name })),
        categories: r.categories.map((c) => ({ id: c.category_id, name: c.category_name, lobbyId: c.lobby_id })),
        streams: r.streams.map((s) => ({ id: s.stream_id, name: s.stream_name, categoryId: s.category_id })),
      };
    },
  });
}
