"use client";

import { useEffect, useState } from "react";
import { PREDICTION_KEYS, type PredictionKey } from "@/src/lib/portal-data";

export type PredictionPhase = "analyzing" | "result" | "flash";

export type PredictionState = {
  phase: PredictionPhase;
  sessionId: number;
  prediction: PredictionKey;
  confidence: number;
  secondsLeft: number;
  correct: boolean;
};

const ANALYZING_MS = 2500;
const RESULT_SECONDS = 5;
const FLASH_MS = 2000;

// TODO: mock chạy vòng lặp phía client. Thay bằng SSE từ API: trạng thái phải đến từ
// server (chỉ user đã bị trừ điểm mới nhận predict_result), không tự sinh ở client.
export function usePredictionCycle(initialSessionId: number): PredictionState {
  const [state, setState] = useState<PredictionState>({
    phase: "analyzing",
    sessionId: initialSessionId,
    prediction: "up",
    confidence: 0,
    secondsLeft: RESULT_SECONDS,
    correct: true,
  });

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    const runCycle = (sessionId: number) => {
      setState((prev) => ({ ...prev, phase: "analyzing", sessionId }));

      wait(ANALYZING_MS, () => {
        const prediction = PREDICTION_KEYS[Math.floor(Math.random() * PREDICTION_KEYS.length)];
        const confidence = Math.round((87 + Math.random() * 8) * 10) / 10;
        const correct = Math.random() > 0.25;
        setState({
          phase: "result",
          sessionId,
          prediction,
          confidence,
          secondsLeft: RESULT_SECONDS,
          correct,
        });

        for (let left = RESULT_SECONDS - 1; left >= 0; left--) {
          wait((RESULT_SECONDS - left) * 1000, () =>
            setState((prev) => ({ ...prev, secondsLeft: left })),
          );
        }

        wait(RESULT_SECONDS * 1000, () => {
          setState((prev) => ({ ...prev, phase: "flash" }));
          wait(FLASH_MS, () => runCycle(sessionId + 1));
        });
      });
    };

    runCycle(initialSessionId + 1);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [initialSessionId]);

  return state;
}
