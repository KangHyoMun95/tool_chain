"use client";

import { usePrediction } from "@/src/hooks/use-prediction";
import { useI18n } from "@/src/i18n/provider";
import { CpuIcon } from "./icons";

type Props = {
  streamId: string;
  connection: "connecting" | "live" | "reconnecting" | "revoked";
  shoe: number | null;
  round: number | null;
  status: string | null;   // status thô của message mới nhất
  statusLabel: string;
  result: string | null;   // actual_result của phiên hiện tại; null = đang chờ
};

export function PredictionPanel({ streamId, connection, shoe, round, status, statusLabel, result }: Props) {
  const { t } = useI18n();
  const { phase, prediction } = usePrediction(streamId, shoe, round, status);
  const online = connection === "live";

  // đúng: xanh, sai: đỏ, kết quả T (hòa): xám
  const tone = !online || !prediction || result === null ? "" : result === "T" ? "draw" : prediction.pick === result ? "win" : "loss";

  return (
    <div className={`card card-glass prediction-panel${tone ? ` result-${tone}` : ""}`} aria-live="polite">
      <div className="stack-sm prediction-state">
        {!online ? (
          <>
            <span className="chip chip-dark chip-wide">Offline</span>
            <p className="analyzing-hint">{t(`live.connection.${connection}` as "live.connection.live")}</p>
          </>
        ) : (
          <>
            <span className="chip chip-dark chip-wide">{statusLabel}</span>
            {phase === "waiting" && <p className="analyzing-title">{t("live.loadingData")}</p>}
            {phase === "analyzing" && (
              <>
                <div className="spinner">
                  <span className="spinner-outer" />
                  <span className="spinner-inner" />
                  <CpuIcon className="spinner-icon" />
                </div>
                <p className="analyzing-title">{t("detail.analyzing")}</p>
              </>
            )}
            {prediction && (
              <>
                <div>
                  <p className="micro-label micro-label-light">{t("live.prediction")}</p>
                  <p className="prediction-result">{prediction.pick}</p>
                  <p className="prediction-confidence">
                    {t("detail.confidence")}: <strong>{prediction.confidence.toFixed(1)}%</strong>
                  </p>
                </div>
                {result !== null && (
                  <div>
                    <p className="prediction-result">{result}</p>
                    <p className={`flash-title is-${tone}`}>
                      {tone === "draw" ? t("live.tie") : tone === "win" ? `✓ ${t("detail.correct")}` : `✕ ${t("detail.wrong")}`}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
