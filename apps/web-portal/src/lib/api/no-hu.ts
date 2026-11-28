// Lucky time của lobby NỔ HŨ (API: GET /no-hu/categories/:id/current, POST /no-hu/categories/:id/unlock).
// Quy tắc nằm ở server (apps/api/src/no-hu): "ván" = một dòng lucky_time; dòng hiện tại = dòng có time_lucky gần nhất TRƯỚC giờ hiện tại
// (quay vòng qua nửa đêm); chi tiết của khung hiện tại chỉ có sau khi user trả phí (không hoàn); đã trả rồi thì xem lại miễn phí.
// Hết điểm ⇒ 402 INSUFFICIENT_BALANCE khi bấm phân tích; lucky_time_id cũ ⇒ 409 STALE_LUCKY_TIME (tải lại).
import { apiGet, apiPost } from "./client";

/** Chi tiết của một dòng lucky time. Cột rỗng = null: giao diện để trống. */
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
  /** Thời điểm (epoch ms, theo đồng hồ của trình duyệt) của dòng tiếp theo, đích của countdown. null khi không có lịch. */
  nextAt: number | null;
  /** confidence của các dòng đứng trước dòng hiện tại (cũ → mới, tối đa HISTORY_ROWS). KHÔNG gồm dòng hiện tại. */
  history: number[];
  /** null = user chưa trả phí cho khung hiện tại. */
  details: LuckyDetails | null;
};

export const HISTORY_ROWS = 15;
/** Chờ thêm một chút sau mốc để server chắc chắn đã sang dòng mới khi countdown về 0. */
const NEXT_PADDING_MS = 700;

type ApiDetails = {
  confidence: number; indicator: string | null; circle_from: number | null; circle_to: number | null;
  range_from: number | null; range_to: number | null; trace_next_circle: number | null; rtp: number | null;
};
type ApiWindow = {
  schedule_empty: boolean; lucky_time_id: string | null; time_lucky: string | null;
  next_at: number | null; server_time: number; history: number[]; details: ApiDetails | null;
};

const toDetails = (d: ApiDetails): LuckyDetails => ({
  confidence: d.confidence, indicator: d.indicator, circleFrom: d.circle_from, circleTo: d.circle_to,
  rangeFrom: d.range_from, rangeTo: d.range_to, traceNextCircle: d.trace_next_circle, rtp: d.rtp,
});

export async function fetchLuckyWindow(categoryId: string): Promise<LuckyWindow> {
  const w = await apiGet<ApiWindow>(`/no-hu/categories/${categoryId}/current`);
  // Đổi mốc của server sang đồng hồ trình duyệt để countdown không lệch khi máy khách sai giờ.
  const skew = Date.now() - w.server_time;
  return {
    scheduleEmpty: w.schedule_empty, luckyTimeId: w.lucky_time_id, timeLucky: w.time_lucky,
    nextAt: w.next_at === null ? null : w.next_at + skew + NEXT_PADDING_MS,
    history: w.history, details: w.details ? toDetails(w.details) : null,
  };
}

/** "Bấm phân tích": server trừ PREDICTION_FEE (không hoàn; đã trả cho khung này thì không trừ) rồi trả chi tiết. */
export async function unlockLucky(categoryId: string, luckyTimeId: string): Promise<LuckyDetails> {
  return toDetails(await apiPost<ApiDetails>(`/no-hu/categories/${categoryId}/unlock`, { lucky_time_id: luckyTimeId }));
}
