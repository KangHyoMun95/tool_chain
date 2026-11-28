// Lucky time của lobby NỔ HŨ. ĐÂY LÀ DỮ LIỆU GIẢ (MOCK): API đọc lịch / trừ phí CHƯA làm, mọi hàm dưới đây sẽ được thay bằng gọi API thật
// mà giữ nguyên kiểu trả về. Khi làm API cần giữ các quy tắc sau (đã chốt):
//  - "Ván" = một dòng lucky_time. Dòng hiện tại = dòng có time_lucky GẦN NHẤT TRƯỚC giờ hiện tại (quay vòng qua nửa đêm); dòng tiếp theo = dòng kế
//    sau nó (cũng quay vòng), dùng cho countdown. Giờ tính theo TZ của hệ thống (mock này dùng giờ của trình duyệt).
//  - Chi tiết (confidence, xu hướng, ...) của dòng hiện tại CHỈ trả sau khi user bấm "phân tích" (trừ PREDICTION_FEE, không hoàn tiền);
//    đã trả rồi thì xem lại miễn phí. Chưa bấm ⇒ `details = null`.
//  - Không đủ điểm ⇒ 402 INSUFFICIENT_BALANCE khi bấm phân tích (vẫn cho vào trang chi tiết bình thường).
//  - Category không có lịch ⇒ `scheduleEmpty = true`.
import { ApiError } from "./client";

/** Chi tiết của một dòng lucky time (cột của bảng lucky_time). Cột rỗng = null: giao diện để trống. */
export type LuckyDetails = {
  confidence: number;            // 0..100
  indicator: string | null;      // "Xu hướng hiện tại"
  circleFrom: number | null;     // "Chu kỳ dự kiến" (vòng)
  circleTo: number | null;
  rangeFrom: number | null;      // "Thời điểm đẹp" dạng phút
  rangeTo: number | null;
  traceNextCircle: number | null; // "Thời điểm đẹp" dạng "N vòng tiếp theo" (ưu tiên hơn range khi có)
  rtp: number | null;            // "Biến động RTP" (%)
};

export type LuckyWindow = {
  scheduleEmpty: boolean;
  /** Dòng hiện tại: null khi không có lịch. */
  luckyTimeId: string | null;
  timeLucky: string | null;      // "HH:MM"
  /** Thời điểm (epoch ms) của dòng tiếp theo, đích của countdown. null khi không có lịch. */
  nextAt: number | null;
  /** confidence của các dòng đứng trước dòng hiện tại (cũ → mới, tối đa HISTORY_ROWS), cho biểu đồ. KHÔNG gồm dòng hiện tại. */
  history: number[];
  /** null = user chưa bấm phân tích dòng hiện tại. */
  details: LuckyDetails | null;
};

export const HISTORY_ROWS = 15;
const STEP_MINUTES = 5;

// ---------- MOCK ----------

type MockRow = { id: string; minutes: number; time: string; details: LuckyDetails };

const hash = (s: string): number => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** PRNG xác định (mulberry32): cùng category + giờ luôn ra cùng số liệu. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const INDICATORS = ["Tăng mạnh", "Tăng nhẹ", "Ổn định", "Giảm nhẹ", null] as const;

const buildSchedule = (categoryId: string): MockRow[] => {
  const rows: MockRow[] = [];
  for (let m = 0; m < 24 * 60; m += STEP_MINUTES) {
    const r = rng(hash(`${categoryId}|${m}`));
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const circleFrom = 3 + Math.floor(r() * 18);
    const kind = r();   // 60% phút, 30% "N vòng tiếp theo", 10% để trống
    const rangeFrom = 1 + Math.floor(r() * 6);
    rows.push({
      id: `${categoryId}:${time}`, minutes: m, time,
      details: {
        confidence: 55 + Math.floor(r() * 43),
        indicator: INDICATORS[Math.floor(r() * INDICATORS.length)],
        circleFrom, circleTo: circleFrom + 2 + Math.floor(r() * 8),
        rangeFrom: kind < 0.6 ? rangeFrom : null, rangeTo: kind < 0.6 ? rangeFrom + 2 + Math.floor(r() * 6) : null,
        traceNextCircle: kind >= 0.6 && kind < 0.9 ? 2 + Math.floor(r() * 8) : null,
        rtp: Math.round((94 + r() * 5) * 100) / 100,
      },
    });
  }
  return rows;
};

const unlockedKey = (id: string) => `noHuUnlocked:${id}`;
const isUnlocked = (id: string): boolean => {
  try { return window.localStorage.getItem(unlockedKey(id)) === "1"; } catch { return false; }
};
const markUnlocked = (id: string): void => {
  try { window.localStorage.setItem(unlockedKey(id), "1"); } catch { /* không lưu được thì lần sau phải bấm lại */ }
};
/** Thêm `?mockEmpty=1` vào URL để thử trạng thái "category chưa có lịch". */
const forceEmpty = (): boolean => new URLSearchParams(window.location.search).get("mockEmpty") === "1";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchLuckyWindow(categoryId: string): Promise<LuckyWindow> {
  await sleep(150);
  if (forceEmpty()) return { scheduleEmpty: true, luckyTimeId: null, timeLucky: null, nextAt: null, history: [], details: null };
  const rows = buildSchedule(categoryId);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Dòng cuối có giờ <= hiện tại; trước dòng đầu tiên của ngày thì quay về dòng cuối (hôm qua).
  let cur = -1;
  for (let i = 0; i < rows.length; i++) if (rows[i].minutes <= nowMin) cur = i;
  if (cur < 0) cur = rows.length - 1;
  const next = (cur + 1) % rows.length;
  const nextAt = new Date(now);
  nextAt.setHours(0, rows[next].minutes, 0, 0);
  if (nextAt.getTime() <= now.getTime()) nextAt.setDate(nextAt.getDate() + 1);

  const history: number[] = [];
  for (let k = Math.min(HISTORY_ROWS, rows.length - 1); k >= 1; k--) {
    history.push(rows[(cur - k + rows.length) % rows.length].details.confidence);
  }
  const row = rows[cur];
  return {
    scheduleEmpty: false, luckyTimeId: row.id, timeLucky: row.time, nextAt: nextAt.getTime(), history,
    details: isUnlocked(row.id) ? row.details : null,
  };
}

/** Thêm `?mockInsufficient=1` vào URL để thử trường hợp hết điểm khi bấm phân tích. */
const forceInsufficient = (): boolean => new URLSearchParams(window.location.search).get("mockInsufficient") === "1";

/** "Bấm phân tích": trừ phí (không hoàn) rồi trả chi tiết. Mock: không trừ tiền, không gọi API; hết điểm giả lập bằng `?mockInsufficient=1`. */
export async function unlockLucky(categoryId: string, luckyTimeId: string): Promise<LuckyDetails> {
  await sleep(500);
  const row = buildSchedule(categoryId).find((r) => r.id === luckyTimeId);
  if (!row) throw new ApiError(404);
  if (!isUnlocked(luckyTimeId)) {
    if (forceInsufficient()) throw new ApiError(402, "INSUFFICIENT_BALANCE");
    markUnlocked(luckyTimeId);
  }
  return row.details;
}
