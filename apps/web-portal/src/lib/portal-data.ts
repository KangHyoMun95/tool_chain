// TODO: dữ liệu mock — thay bằng API thật (lobbies / categories / streams / predictions)
// khi backend có endpoint. Giữ nguyên chữ ký hàm để các trang không phải đổi.

export type PredictionKey = "up" | "down" | "forward" | "reverse";

export type Lobby = {
  id: string;
  name: string;
  description: string;
  initial: string;
  tableCount: number;
};

export type Category = {
  id: string;
  lobbyId: string;
  name: string;
  streamCount: number;
  aiWinRate: number;
};

export type Stream = {
  id: string;
  categoryId: string;
  name: string;
  sessionId: number;
  aiWinRate: number;
  winStreak: number;
  recentResults: boolean[];
};

export type HistoryEntry = {
  sessionId: number;
  prediction: PredictionKey;
  correct: boolean;
};

export const PREDICTION_KEYS: PredictionKey[] = ["up", "down", "forward", "reverse"];

const LOBBIES: Omit<Lobby, "tableCount">[] = [
  { id: "alpha", name: "Alpha Royale", description: "Trend / Reverse", initial: "A" },
  { id: "beta", name: "Beta Quantum", description: "Rise / Fall Matrix", initial: "B" },
  { id: "gamma", name: "Gamma Data", description: "Frequency Analysis", initial: "G" },
];

const CATEGORY_SEEDS: Category[] = [
  { id: "alpha-trend", lobbyId: "alpha", name: "Trend Up / Down", streamCount: 6, aiWinRate: 88.5 },
  { id: "alpha-wave", lobbyId: "alpha", name: "Fast Volatility Wave", streamCount: 4, aiWinRate: 85.2 },
  { id: "alpha-balance", lobbyId: "alpha", name: "Neural Balance Index", streamCount: 4, aiWinRate: 82.0 },
  { id: "beta-forward", lobbyId: "beta", name: "Forward Wave Cycle", streamCount: 5, aiWinRate: 89.1 },
  { id: "beta-reverse", lobbyId: "beta", name: "Reverse Wave Cycle", streamCount: 5, aiWinRate: 86.4 },
  { id: "gamma-frequency", lobbyId: "gamma", name: "Frequency Analysis", streamCount: 4, aiWinRate: 87.8 },
  { id: "gamma-deviation", lobbyId: "gamma", name: "Quantum Deviation", streamCount: 4, aiWinRate: 84.5 },
];

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

export function listLobbies(): Lobby[] {
  return LOBBIES.map((lobby) => ({
    ...lobby,
    tableCount: CATEGORY_SEEDS.filter((c) => c.lobbyId === lobby.id).reduce(
      (sum, c) => sum + c.streamCount,
      0,
    ),
  }));
}

export function getLobby(id: string): Lobby | undefined {
  return listLobbies().find((l) => l.id === id);
}

export function listCategories(lobbyId: string): Category[] {
  return CATEGORY_SEEDS.filter((c) => c.lobbyId === lobbyId);
}

export function getCategory(id: string): Category | undefined {
  return CATEGORY_SEEDS.find((c) => c.id === id);
}

function buildStream(category: Category, index: number): Stream {
  const rand = seeded(hash(`${category.id}-${index}`));
  const recentResults = Array.from({ length: 10 }, () => rand() > 0.2);
  let winStreak = 0;
  for (let i = recentResults.length - 1; i >= 0 && recentResults[i]; i--) winStreak++;
  return {
    id: `${category.id}-${index + 1}`,
    categoryId: category.id,
    name: `Table ${String(index + 1).padStart(2, "0")}`,
    sessionId: 8841 + index,
    aiWinRate: Math.round((category.aiWinRate - 3 + rand() * 6) * 10) / 10,
    winStreak,
    recentResults,
  };
}

export function listStreams(categoryId: string): Stream[] {
  const category = getCategory(categoryId);
  if (!category) return [];
  return Array.from({ length: category.streamCount }, (_, i) => buildStream(category, i));
}

export function getStream(id: string): Stream | undefined {
  const match = /^(.*)-(\d+)$/.exec(id);
  if (!match) return undefined;
  const category = getCategory(match[1]);
  const index = Number(match[2]) - 1;
  if (!category || index < 0 || index >= category.streamCount) return undefined;
  return buildStream(category, index);
}

export function getStreamHistory(stream: Stream, count = 10): HistoryEntry[] {
  const rand = seeded(hash(`history-${stream.id}`));
  return Array.from({ length: count }, (_, i) => ({
    sessionId: stream.sessionId - 1 - i,
    prediction: PREDICTION_KEYS[Math.floor(rand() * PREDICTION_KEYS.length)],
    correct: stream.recentResults[stream.recentResults.length - 1 - i] ?? true,
  }));
}

export type ConfidencePoint = { sessionId: number; value: number };

export function getConfidenceSeries(stream: Stream, count = 10): ConfidencePoint[] {
  const rand = seeded(hash(`confidence-${stream.id}`));
  return Array.from({ length: count }, (_, i) => ({
    sessionId: stream.sessionId - count + i,
    value: Math.round((78 + rand() * 18) * 10) / 10,
  }));
}
