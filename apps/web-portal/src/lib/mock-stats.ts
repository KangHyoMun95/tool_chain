// TODO: dữ liệu AI GIẢ LẬP (tỉ lệ thắng, chuỗi thắng, lịch sử, độ tin cậy, mã phiên) — chưa có API prediction.
// Số giả ổn định theo hash của id (UUID) để SSR/client khớp nhau. Sảnh / loại game / bàn là dữ liệu thật ở src/lib/api/catalog.ts.
// Khi có API prediction thì thay các hàm get* bên dưới và xóa file này.

export type PredictionKey = "up" | "down" | "forward" | "reverse";

export type HistoryEntry = {
  sessionId: number;
  prediction: PredictionKey;
  correct: boolean;
};

export type StreamStats = {
  sessionId: number;
  aiWinRate: number;
  winStreak: number;
  recentResults: boolean[];
};

export type ConfidencePoint = { sessionId: number; value: number };

export const PREDICTION_KEYS: PredictionKey[] = ["up", "down", "forward", "reverse"];

// Sinh số giả ngẫu nhiên ổn định theo seed để SSR và client cho cùng kết quả.
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hash(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}


/** Tỉ lệ win AI giả của một loại game. */
export function getCategoryWinRate(categoryId: string): number {
  const rand = seeded(hash(`category-${categoryId}`));
  return Math.round((82 + rand() * 8) * 10) / 10;
}

export function getStreamStats(streamId: string): StreamStats {
  const rand = seeded(hash(`stream-${streamId}`));
  const recentResults = Array.from({ length: 10 }, () => rand() > 0.2);
  let winStreak = 0;
  for (let i = recentResults.length - 1; i >= 0 && recentResults[i]; i--) winStreak++;
  return {
    sessionId: 8841 + Math.floor(rand() * 1000),
    aiWinRate: Math.round((82 + rand() * 8) * 10) / 10,
    winStreak,
    recentResults,
  };
}

export function getStreamHistory(streamId: string, stats: StreamStats, count = 10): HistoryEntry[] {
  const rand = seeded(hash(`history-${streamId}`));
  return Array.from({ length: count }, (_, i) => ({
    sessionId: stats.sessionId - 1 - i,
    prediction: PREDICTION_KEYS[Math.floor(rand() * PREDICTION_KEYS.length)],
    correct: stats.recentResults[stats.recentResults.length - 1 - i] ?? true,
  }));
}

export function getConfidenceSeries(streamId: string, stats: StreamStats, count = 10): ConfidencePoint[] {
  const rand = seeded(hash(`confidence-${streamId}`));
  return Array.from({ length: count }, (_, i) => ({
    sessionId: stats.sessionId - count + i,
    value: Math.round((78 + rand() * 18) * 10) / 10,
  }));
}
