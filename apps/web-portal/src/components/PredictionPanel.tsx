"use client";

import { usePredictionCycle } from "@/src/hooks/use-prediction-cycle";
import { useI18n } from "@/src/i18n/provider";
import { CpuIcon } from "./icons";

export function PredictionPanel({ sessionId }: { sessionId: number }) {
  const { t } = useI18n();
  const state = usePredictionCycle(sessionId);

  const flashClass =
    state.phase === "flash" ? (state.correct ? " flash-win" : " flash-loss") : "";

  return (
    <div
      className={`card card-glass prediction-panel${flashClass}`}
      aria-live="polite"
    >
      {state.phase === "analyzing" && (
        <div className="stack-sm prediction-state">
          <div className="spinner">
            <span className="spinner-outer" />
            <span className="spinner-inner" />
            <CpuIcon className="spinner-icon" />
          </div>
          <div>
            <p className="analyzing-title">{t("detail.analyzing")}</p>
            <p className="analyzing-hint">{t("detail.analyzingHint")}</p>
          </div>
          <div className="progress-track">
            <div className="progress-fill scanner-line" />
          </div>
        </div>
      )}

      {state.phase === "result" && (
        <div className="stack-sm prediction-state">
          <span className="chip chip-dark chip-wide">{t("detail.newPrediction")}</span>
          <div>
            <p className="prediction-result">{t(`prediction.${state.prediction}`)}</p>
            <p className="prediction-confidence">
              {t("detail.confidence")}: <strong>{state.confidence.toFixed(1)}%</strong>
            </p>
          </div>
          <div className="prediction-countdown">
            <p className="micro-label micro-label-light">{t("detail.awaitingResult")}</p>
            <p className="metric metric-amber-dark countdown">{`00:0${state.secondsLeft}s`}</p>
          </div>
        </div>
      )}

      {state.phase === "flash" && (
        <div className="stack-sm prediction-state">
          <div className={`flash-icon ${state.correct ? "is-win" : "is-loss"}`}>
            {state.correct ? "✓" : "✕"}
          </div>
          <h3 className={`flash-title ${state.correct ? "is-win" : "is-loss"}`}>
            {state.correct ? t("detail.winTitle") : t("detail.lossTitle")}
          </h3>
          <p className="flash-subtitle">
            {state.correct
              ? t("detail.winSubtitle", { id: state.sessionId })
              : t("detail.lossSubtitle")}
          </p>
        </div>
      )}
    </div>
  );
}
