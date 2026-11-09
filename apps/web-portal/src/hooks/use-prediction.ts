"use client";

import { useEffect, useRef, useState } from "react";
import { IS_LIVE_SOURCE, predictionSource, type Prediction } from "@/src/lib/prediction-source";

export type PredictionPhase = "waiting" | "analyzing" | "ready" | "missing";

/**
 * Workflow của một ván CHỈ bắt đầu khi nhận message IN_PROGRESS của ván đó (vào giữa ván thì chờ ván kế tiếp).
 * - waiting: chưa thấy IN_PROGRESS của ván hiện tại ("đang nạp dữ liệu").
 * - analyzing: đang chờ dự đoán (bánh răng). Chỉ gọi nguồn MỘT lần cho mỗi ván, nhiều IN_PROGRESS liên tiếp không gọi lại;
 *   gọi lỗi thì lần IN_PROGRESS kế tiếp thử lại.
 * - ready: có dự đoán (prediction.pick = null nghĩa là AI chưa đủ dữ liệu).
 * - missing: (nguồn live) ván đã qua IN_PROGRESS mà vẫn chưa có dự đoán, tức là về muộn và bị bỏ.
 */
export function usePrediction(streamId: string, shoe: number | null, round: number | null, status: string | null) {
  const key = shoe !== null && round !== null ? `${shoe}:${round}` : null;
  const [state, setState] = useState<{ key: string; prediction: Prediction | null } | null>(null);
  const startedRef = useRef<string | null>(null);
  const requestRef = useRef<{ key: string; ctrl: AbortController } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Sang ván khác / đổi stream / rời trang: hủy yêu cầu đang chờ. Hủy xong thì cho phép bắt đầu lại (StrictMode chạy effect hai lần).
  useEffect(() => () => {
    const req = requestRef.current;
    if (req?.key !== key) return;
    req.ctrl.abort();
    if (startedRef.current === key) startedRef.current = null;
  }, [streamId, key]);

  useEffect(() => {
    if (key === null || shoe === null || round === null || status !== "IN_PROGRESS" || startedRef.current === key) return;
    startedRef.current = key;
    const ctrl = new AbortController();
    requestRef.current = { key, ctrl };
    setState({ key, prediction: null });
    predictionSource.getPrediction(streamId, shoe, round, ctrl.signal).then(
      (prediction) => { if (alive.current) setState((s) => (s?.key === key ? { key, prediction } : s)); },
      (err) => {
        if (ctrl.signal.aborted) return;
        console.warn("[prediction] không lấy được dự đoán", err);
        if (startedRef.current === key) startedRef.current = null;
      },
    );
  }, [streamId, key, shoe, round, status]);

  if (key === null || state?.key !== key) return { phase: "waiting" as PredictionPhase, prediction: null };
  if (state.prediction) return { phase: "ready" as PredictionPhase, prediction: state.prediction };
  return { phase: (IS_LIVE_SOURCE && status !== "IN_PROGRESS" ? "missing" : "analyzing") as PredictionPhase, prediction: null };
}
