// Dự đoán đã nhận được trong phiên này, theo (stream, shoe, round). Nguồn: event SSE `prediction` và GET /predictions/current.
// Có giới hạn kích thước (bỏ mục cũ nhất) để chạy lâu không phình bộ nhớ.
import type { Prediction } from "./prediction-source";

const MAX_ENTRIES = 300;
const entries = new Map<string, Prediction>();
const listeners = new Map<string, Set<(p: Prediction) => void>>();
const keyOf = (streamId: string, shoe: number, round: number) => `${streamId}:${shoe}:${round}`;

export const predictionStore = {
  get: (streamId: string, shoe: number, round: number): Prediction | undefined => entries.get(keyOf(streamId, shoe, round)),

  put(streamId: string, shoe: number, round: number, prediction: Prediction): void {
    const key = keyOf(streamId, shoe, round);
    if (!entries.has(key) && entries.size >= MAX_ENTRIES) {
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }
    entries.set(key, prediction);
    listeners.get(key)?.forEach((fn) => fn(prediction));
  },

  /** Gọi fn khi dự đoán của (stream, shoe, round) về. Trả hàm hủy đăng ký. */
  subscribe(streamId: string, shoe: number, round: number, fn: (p: Prediction) => void): () => void {
    const key = keyOf(streamId, shoe, round);
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) listeners.delete(key);
    };
  },
};
