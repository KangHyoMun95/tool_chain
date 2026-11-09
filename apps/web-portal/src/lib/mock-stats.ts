// TODO: dữ liệu AI GIẢ LẬP chỉ còn cho thẻ bàn ở danh sách (StreamCard). Màn hình chi tiết bàn đã dùng API thật (GET /streams/:id/predictions/stats).
// Số giả ổn định theo hash của id (UUID) để SSR/client khớp nhau. Sảnh / loại game / bàn là dữ liệu thật ở src/lib/api/catalog.ts.
// Khi có API thống kê cho danh sách bàn thì thay getStreamStats và xóa file này.

export type StreamStats = {
  sessionId: number;
  aiWinRate: number;
  winStreak: number;
  recentResults: boolean[];
};

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
