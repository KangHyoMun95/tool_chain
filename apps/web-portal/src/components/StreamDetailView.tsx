"use client";

import { useI18n } from "@/src/i18n/provider";
import type { ConfidencePoint, HistoryEntry, Stream } from "@/src/lib/portal-data";
import { ConfidenceChart } from "./ConfidenceChart";
import { HistoryTile } from "./HistoryTile";
import { PredictionPanel } from "./PredictionPanel";
import { StatTile } from "./StatTile";

export function StreamDetailView({
  stream,
  history,
  confidence,
}: {
  stream: Stream;
  history: HistoryEntry[];
  confidence: ConfidencePoint[];
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="card card-glass page-head">
        <div>
          <span className="chip chip-dark chip-wide">{t("detail.badge")}</span>
          <h2 className="page-title">{t("detail.title", { stream: stream.name })}</h2>
          <p className="hint">{t("detail.subtitle")}</p>
        </div>
        <div className="page-head-side">
          <span className="hint">{t("detail.scanningSession")}</span>
          <span className="metric metric-purple">#{stream.sessionId + 1}-AI</span>
        </div>
      </div>

      <div className="split split-detail">
        <section className="split-side stack">
          <PredictionPanel sessionId={stream.sessionId} />
          <div className="grid grid-2 grid-tight">
            <StatTile label={t("detail.currentWinRate")} value={`${stream.aiWinRate.toFixed(1)}%`} />
            <StatTile label={t("detail.liveWinStreak")} value={`${stream.winStreak} 🔥`} tone="amber" />
          </div>
        </section>

        <section className="split-main stack">
          <div className="card card-glass stack-sm">
            <div className="section-head">
              <h3 className="section-title">{t("detail.chartTitle")}</h3>
              <span className="chip chip-amber">{t("detail.chartRange", { count: confidence.length })}</span>
            </div>
            <ConfidenceChart points={confidence} />
          </div>

          <div className="card card-glass stack-sm">
            <h3 className="section-title">{t("detail.historyTitle", { count: history.length })}</h3>
            <div className="grid grid-history">
              {history.map((entry) => (
                <HistoryTile key={entry.sessionId} entry={entry} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
