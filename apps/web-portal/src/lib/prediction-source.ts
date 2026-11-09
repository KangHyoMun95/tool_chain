// Nguồn dự đoán cho một ván.
// - live (mặc định): dự đoán do AI tính và API đẩy xuống qua SSE (event `prediction`); vào giữa ván / tải lại trang thì hỏi
//   GET /streams/:id/predictions/current. Event SSE được use-stream-session đưa vào predictionStore.
// - mock: giả lập (~2.5s, giá trị xác định từ (stream, shoe, round)) để thử UI khi không chạy AI.
// Chọn bằng NEXT_PUBLIC_PREDICTION_SOURCE=live|mock (xem .env.example).
import type { PredictionReason } from "@toolhackchain/shared";
import { fetchCurrentPrediction } from "./api/predictions";
import { predictionStore } from "./prediction-store";

export type Outcome = "B" | "P" | "T";
/** pick = null khi AI không đủ dữ liệu để dự đoán (reason ≠ OK). confidence là phần trăm 0–100. */
export type Prediction = { pick: "B" | "P" | null; confidence: number | null; reason: PredictionReason };

export interface PredictionSource {
  /** Resolve khi có dự đoán của (stream, shoe, round); reject khi `signal` bị hủy. */
  getPrediction(streamId: string, shoe: number, round: number, signal?: AbortSignal): Promise<Prediction>;
  /** Dự đoán đã biết (đồng bộ, không gọi mạng); undefined nếu chưa có. */
  peek(streamId: string, shoe: number, round: number): Prediction | undefined;
}

export const MOCK_LATENCY_MS = 2500;

/** Dữ liệu dự đoán từ API / SSE (tỉ lệ 0–1) → Prediction (phần trăm). */
export const toPrediction = (d: { pick: "B" | "P" | null; confidence: number | null; reason: PredictionReason }): Prediction => ({
  pick: d.pick,
  confidence: d.confidence === null ? null : d.confidence * 100,
  reason: d.reason,
});

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Giá trị XÁC ĐỊNH từ (stream, shoe, round): cùng ván luôn cùng dự đoán, kể cả khi tải lại trang. */
function mockValue(streamId: string, shoe: number, round: number): Prediction {
  const h = hash(`${streamId}|${shoe}|${round}`);
  return { pick: h % 2 === 0 ? "B" : "P", confidence: 80 + ((h >>> 8) % 150) / 10, reason: "OK" };   // 80.0 – 94.9
}

export const mockPredictionSource: PredictionSource = {
  getPrediction: (streamId, shoe, round) =>
    new Promise((resolve) => setTimeout(() => resolve(mockValue(streamId, shoe, round)), MOCK_LATENCY_MS)),
  peek: mockValue,
};

export const livePredictionSource: PredictionSource = {
  peek: (streamId, shoe, round) => predictionStore.get(streamId, shoe, round),

  getPrediction: (streamId, shoe, round, signal) =>
    new Promise((resolve, reject) => {
      const known = predictionStore.get(streamId, shoe, round);
      if (known) return resolve(known);

      const onAbort = () => { unsubscribe(); reject(new DOMException("aborted", "AbortError")); };
      const unsubscribe = predictionStore.subscribe(streamId, shoe, round, (p) => {
        unsubscribe();
        signal?.removeEventListener("abort", onAbort);
        resolve(p);
      });
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });

      // Vào giữa ván / tải lại trang: event SSE đã qua, hỏi API. Lỗi mạng thì bỏ qua, event SSE sẽ tới.
      fetchCurrentPrediction(streamId).then((cur) => {
        if (cur) predictionStore.put(streamId, cur.shoe, cur.round, toPrediction(cur));   // khớp ván đang chờ thì listener ở trên resolve
      }).catch(() => undefined);
    }),
};

/** live: hết IN_PROGRESS mà chưa có dự đoán nghĩa là đã quá hạn (API bỏ dự đoán về muộn). */
export const IS_LIVE_SOURCE = process.env.NEXT_PUBLIC_PREDICTION_SOURCE !== "mock";
export const predictionSource: PredictionSource = IS_LIVE_SOURCE ? livePredictionSource : mockPredictionSource;
