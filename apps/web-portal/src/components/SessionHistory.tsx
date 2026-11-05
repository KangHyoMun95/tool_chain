"use client";

import { useI18n } from "@/src/i18n/provider";
import type { HistoryRow } from "@/src/hooks/use-stream-history";
import { mockPredictionSync } from "@/src/lib/prediction-source";

type Props = { streamId: string; shoe: number | null; rows: HistoryRow[]; error: boolean };

export function SessionHistory({ streamId, shoe, rows, error }: Props) {
  const { t } = useI18n();

  return (
    <div className="card card-glass stack-sm">
      <h3 className="section-title">{t("live.historyTitle", { shoe: shoe ?? "—" })}</h3>
      {error && <p className="hint">{t("live.historyError")}</p>}
      {rows.length === 0 && !error && <p className="hint">{t("live.historyEmpty")}</p>}
      <div className="lgrid grid-history">
        {rows.map((r) => {
          const pick = mockPredictionSync(streamId, r.shoe, r.round).pick;
          const tone = r.result === "T" ? "draw" : r.result !== null && pick === r.result ? "win" : "loss";
          return (
            <div key={`${r.shoe}:${r.round}`} className={`history-tile is-${tone}`}>
              <span className="history-session">{t("live.session", { shoe: r.shoe, round: r.round })}</span>
              <span className="history-prediction">{pick} → {r.result ?? "—"}</span>
              <span className="history-badge">
                {tone === "draw" ? t("live.tie") : tone === "win" ? `✓ ${t("detail.correct")}` : `✕ ${t("detail.wrong")}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
