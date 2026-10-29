"use client";

import { useI18n } from "@/src/i18n/provider";
import type { HistoryEntry } from "@/src/lib/portal-data";

export function HistoryTile({ entry }: { entry: HistoryEntry }) {
  const { t } = useI18n();
  const tone = entry.correct ? "is-win" : "is-loss";

  return (
    <div className={`history-tile ${tone}`}>
      <span className="history-session">{t("detail.session", { id: entry.sessionId })}</span>
      <span className="history-prediction">{t(`predictionShort.${entry.prediction}`)}</span>
      <span className="history-badge">
        {entry.correct ? `✓ ${t("detail.correct")}` : `✕ ${t("detail.wrong")}`}
      </span>
    </div>
  );
}
