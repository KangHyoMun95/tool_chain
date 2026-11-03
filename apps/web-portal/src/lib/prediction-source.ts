// Nguồn dự đoán cho một ván. Thực tế: một luồng khác ghi prediction vào DB trước, portal chỉ ĐỌC lại qua API.
// Hiện là bản giả lập (giả vờ gọi API mất ~2.5s, trả giá trị xác định); khi có API thật thì thay `predictionSource`, không sửa UI.

export type Outcome = "B" | "P" | "T";
export type Prediction = { pick: "B" | "P"; confidence: number };   // dự đoán chỉ B hoặc P

export interface PredictionSource {
  getPrediction(streamId: string, shoe: number, round: number): Promise<Prediction>;
}

export const MOCK_LATENCY_MS = 2500;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Giá trị XÁC ĐỊNH từ (stream, shoe, round): cùng ván luôn cùng dự đoán, kể cả khi tải lại trang. */
function mockValue(streamId: string, shoe: number, round: number): Prediction {
  const h = hash(`${streamId}|${shoe}|${round}`);
  return { pick: h % 2 === 0 ? "B" : "P", confidence: 80 + ((h >>> 8) % 150) / 10 };   // 80.0 – 94.9
}

export const mockPredictionSource: PredictionSource = {
  getPrediction: (streamId, shoe, round) =>
    new Promise((resolve) => setTimeout(() => resolve(mockValue(streamId, shoe, round)), MOCK_LATENCY_MS)),
};

export const predictionSource: PredictionSource = mockPredictionSource;

// TODO: lịch sử cũng phải lấy dự đoán từ DB (kèm API lịch sử) khi có nguồn thật; tạm tính đồng bộ từ cùng giá trị giả lập.
export const mockPredictionSync = mockValue;
