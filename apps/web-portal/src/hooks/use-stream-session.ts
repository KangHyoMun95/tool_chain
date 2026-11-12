"use client";

import { useCallback, useRef, useState } from "react";
import {
  buildKeyId, STREAM_STATUSES, type CrawlPayload, type RealtimePrediction, type RealtimeRoundResult, type StreamStatus,
} from "@toolhackchain/shared";
import { toPrediction } from "@/src/lib/prediction-source";
import { predictionStore } from "@/src/lib/prediction-store";
import { useLiveItems } from "./use-live-items";
import { usePredictionStats } from "./use-prediction-stats";
import { useStreamHistory } from "./use-stream-history";

export type StreamRef = { id: string; lobbyName: string; categoryName: string; name: string };
export type Totals = { B: number; P: number; T: number };

const STATS_AFTER_RESULT_MS = 4500;       // lớn hơn chu kỳ ghi batch của API (3s), sau lần refetch lịch sử
const STATS_AFTER_PREDICTION_MS = 500;   // API đã lưu prediction trước khi đẩy SSE

const toInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Số liệu total_B/P/T của message mới nhất; null = chưa đủ dữ liệu. */
function toTotals(d: CrawlPayload | undefined): Totals | null {
  if (!d) return null;
  const { total_B: B, total_P: P, total_T: T } = d;
  return [B, P, T].every((x) => typeof x === "number" && Number.isFinite(x)) ? { B, P, T } : null;
}

/** Realtime + lịch sử của một stream. Tick (trạng thái trực tiếp), round_result (kết quả) + pick đi qua useLiveItems (kết nối tham gia, lọc theo stream_id), lịch sử qua useStreamHistory. */
export function useStreamSession(stream: StreamRef) {
  const keyId = buildKeyId(stream.lobbyName, stream.categoryName, stream.name);
  const [result, setResult] = useState<{ shoe: number; round: number; value: string } | null>(null);
  const warned = useRef(new Set<string>());        // status lạ đã log
  const historyApi = useRef<ReturnType<typeof useStreamHistory> | null>(null);
  const statsApi = useRef<ReturnType<typeof usePredictionStats> | null>(null);

  // Kết quả / lịch sử / đúng-sai CHỈ từ round_result (hub phát một lần, chỉ đi tới). Ván bị bỏ qua (kết quả về muộn sau
  // ván mới hơn) được refetch lịch sử lấp lại từ DB.
  const onRoundResult = useCallback((r: RealtimeRoundResult) => {
    const { shoe, round, result: value } = r;
    setResult({ shoe, round, value });
    historyApi.current?.addOptimistic({ shoe, round, result: value });
    historyApi.current?.scheduleRefetch();
    statsApi.current?.scheduleRefresh(STATS_AFTER_RESULT_MS);   // thắng / thua đã được API ghi (batch 3s)
  }, []);

  const onPrediction = useCallback((p: RealtimePrediction) => {
    predictionStore.put(p.data.stream_id, p.data.shoe, p.data.round, toPrediction(p.data));
    statsApi.current?.scheduleRefresh(STATS_AFTER_PREDICTION_MS);   // điểm mới cho biểu đồ độ tin cậy
  }, []);

  // Trang chi tiết = tham gia stream (bị trừ tiền mỗi dự đoán có pick); hết điểm ⇒ connection = "insufficient".
  const live = useLiveItems<CrawlPayload>([keyId], { streamId: stream.id, participate: true, onRoundResult, onPrediction });
  const latest = live.ticks[keyId]?.data;
  const shoe = latest ? toInt(latest.stream_shoe) : null;
  const round = latest ? toInt(latest.stream_round) : null;

  const history = useStreamHistory(stream.id, shoe, live.reconnectCount);
  historyApi.current = history;
  const stats = usePredictionStats(stream.id, live.reconnectCount);
  statsApi.current = stats;

  let status: StreamStatus | "unknown" | null = null;
  if (latest?.status) {
    if ((STREAM_STATUSES as readonly string[]).includes(latest.status)) status = latest.status as StreamStatus;
    else {
      status = "unknown";
      if (!warned.current.has(latest.status)) {
        warned.current.add(latest.status);
        console.warn(`[stream] status lạ: ${latest.status}`);
      }
    }
  }

  // Kết quả chỉ hiện cho đúng phiên hiện tại; sang round mới thì về trạng thái chờ.
  const currentResult = result && result.shoe === shoe && result.round === round ? result.value : null;

  return {
    connection: live.status,
    latest,
    shoe, round, status,
    result: currentResult,
    totals: toTotals(latest),
    streamerName: latest?.streamer_name ?? null,
    country: latest?.streamer_country ?? null,
    history,
    stats: stats.stats,
  };
}
