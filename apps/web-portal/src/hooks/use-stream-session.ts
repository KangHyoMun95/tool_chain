"use client";

import { useCallback, useRef, useState } from "react";
import { buildKeyId, STREAM_STATUSES, type CrawlPayload, type RealtimePrediction, type StreamStatus } from "@toolhackchain/shared";
import { toPrediction } from "@/src/lib/prediction-source";
import { predictionStore } from "@/src/lib/prediction-store";
import { useLiveItems } from "./use-live-items";
import { useStreamHistory } from "./use-stream-history";

export type StreamRef = { id: string; lobbyName: string; categoryName: string; name: string };
export type Totals = { B: number; P: number; T: number };

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

/** Realtime + lịch sử của một stream. Tick đi qua useLiveItems (lọc theo stream_id), lịch sử qua useStreamHistory. */
export function useStreamSession(stream: StreamRef) {
  const keyId = buildKeyId(stream.lobbyName, stream.categoryName, stream.name);
  const [result, setResult] = useState<{ shoe: number; round: number; value: string } | null>(null);
  const seen = useRef(new Set<string>());          // (shoe, round) đã xử lý kết quả
  const warned = useRef(new Set<string>());        // status lạ đã log
  const historyApi = useRef<ReturnType<typeof useStreamHistory> | null>(null);

  const onTick = useCallback((t: { data: CrawlPayload }) => {
    const d = t.data;
    const shoe = toInt(d.stream_shoe);
    const round = toInt(d.stream_round);
    if (shoe === null || round === null || d.actual_result == null) return;   // kết quả = actual_result != null (không dựa vào status)
    const k = `${shoe}:${round}`;
    if (seen.current.has(k)) return;
    if (seen.current.size > 500) seen.current.clear();
    seen.current.add(k);
    setResult({ shoe, round, value: d.actual_result });
    historyApi.current?.addOptimistic({ shoe, round, result: d.actual_result });
    historyApi.current?.scheduleRefetch();
  }, []);

  const onPrediction = useCallback((p: RealtimePrediction) => {
    predictionStore.put(p.data.stream_id, p.data.shoe, p.data.round, toPrediction(p.data));
  }, []);

  const live = useLiveItems<CrawlPayload>([keyId], { streamId: stream.id, onTick, onPrediction });
  const latest = live.ticks[keyId]?.data;
  const shoe = latest ? toInt(latest.stream_shoe) : null;
  const round = latest ? toInt(latest.stream_round) : null;

  const history = useStreamHistory(stream.id, shoe, live.reconnectCount);
  historyApi.current = history;

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
  };
}
