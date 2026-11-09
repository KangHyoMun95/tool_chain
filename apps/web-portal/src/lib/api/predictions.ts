import type { ChosenPattern, PredictionReason } from "@toolhackchain/shared";
import { ApiError, apiGet } from "./client";

/** GET /streams/:id/predictions/current — confidence là tỉ lệ 0–1. */
export type CurrentPredictionDto = {
  prediction_id: string;
  game_session_id: string;
  stream_id: string;
  shoe: number;
  round: number;
  pick: "B" | "P" | null;
  confidence: number | null;
  chosen: ChosenPattern | null;
  reason: PredictionReason;
  model_version: string;
  created_at: string;
};

/** Prediction mới nhất của stream; null khi chưa có (API trả 404). */
export async function fetchCurrentPrediction(streamId: string): Promise<CurrentPredictionDto | null> {
  try {
    return await apiGet<CurrentPredictionDto>(`/streams/${encodeURIComponent(streamId)}/predictions/current`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** GET /streams/:id/predictions/stats — win_rate và confidence là tỉ lệ 0–1. Hòa (T) không tính thắng / thua. */
export type PredictionStatsDto = {
  window: number;
  evaluated: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number | null;
  win_streak: number;
  recent: { shoe: number; round: number; pick: "B" | "P"; confidence: number; result: string | null; created_at: string }[];
};

export const fetchPredictionStats = (streamId: string): Promise<PredictionStatsDto> =>
  apiGet<PredictionStatsDto>(`/streams/${encodeURIComponent(streamId)}/predictions/stats`);
