"use client";

import { useEffect, useRef, useState } from "react";
import { predictionSource, type Prediction } from "@/src/lib/prediction-source";

export type PredictionPhase = "waiting" | "analyzing" | "ready";

/**
 * Workflow của một ván CHỈ bắt đầu khi nhận message IN_PROGRESS của ván đó (vào giữa ván thì chờ ván kế tiếp).
 * - waiting: chưa thấy IN_PROGRESS của ván hiện tại ("đang nạp dữ liệu").
 * - analyzing: đang lấy dự đoán từ nguồn (bánh răng). Chỉ gọi MỘT lần cho mỗi ván, nhiều IN_PROGRESS liên tiếp không gọi lại;
 *   gọi lỗi thì lần IN_PROGRESS kế tiếp thử lại.
 * - ready: có dự đoán.
 */
export function usePrediction(streamId: string, shoe: number | null, round: number | null, status: string | null) {
  const key = shoe !== null && round !== null ? `${shoe}:${round}` : null;
  const [state, setState] = useState<{ key: string; prediction: Prediction | null } | null>(null);
  const startedRef = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (key === null || shoe === null || round === null || status !== "IN_PROGRESS" || startedRef.current === key) return;
    startedRef.current = key;
    setState({ key, prediction: null });
    predictionSource.getPrediction(streamId, shoe, round).then(
      (prediction) => { if (alive.current) setState((s) => (s?.key === key ? { key, prediction } : s)); },
      (err) => { console.warn("[prediction] không lấy được dự đoán", err); if (startedRef.current === key) startedRef.current = null; },
    );
  }, [streamId, key, shoe, round, status]);

  if (key === null || state?.key !== key) return { phase: "waiting" as PredictionPhase, prediction: null };
  return state.prediction
    ? { phase: "ready" as PredictionPhase, prediction: state.prediction }
    : { phase: "analyzing" as PredictionPhase, prediction: null };
}
