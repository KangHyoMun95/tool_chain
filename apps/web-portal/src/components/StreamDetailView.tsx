"use client";

import { useMemo } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { getStream } from "@/src/lib/api/catalog";
import { getConfidenceSeries, getStreamHistory, getStreamStats } from "@/src/lib/mock-stats";
import { ConfidenceChart } from "./ConfidenceChart";
import { ErrorState, LoadingState } from "./DataStates";
import { HistoryTile } from "./HistoryTile";
import { NotFoundView } from "./NotFoundView";
import { PortalShell } from "./PortalShell";
import { PredictionPanel } from "./PredictionPanel";
import { StatTile } from "./StatTile";

// Tự bọc PortalShell vì liên kết "quay lại" phụ thuộc category của bàn (chỉ biết sau khi tải xong).
export function StreamDetailView({ streamId }: { streamId: string }) {
  const stream = useApi(() => getStream(streamId), [streamId]);
  const back =
    stream.status === "success"
      ? { href: `/categories/${stream.data.categoryId}`, labelKey: "nav.backToStreams" as const }
      : { href: "/", labelKey: "nav.backToLobbies" as const };

  return (
    <PortalShell back={back}>
      {stream.status === "loading" && <LoadingState />}
      {stream.status === "error" &&
        (stream.error.status === 404 || stream.error.status === 400
          ? <NotFoundView />
          : <ErrorState error={stream.error} onRetry={stream.reload} />)}
      {stream.status === "success" && <StreamDetail id={stream.data.id} name={stream.data.name} />}
    </PortalShell>
  );
}

function StreamDetail({ id, name }: { id: string; name: string }) {
  const { t } = useI18n();
  // TODO: số liệu AI giả lập (src/lib/mock-stats.ts), chưa có API prediction.
  const stats = useMemo(() => getStreamStats(id), [id]);
  const history = useMemo(() => getStreamHistory(id, stats), [id, stats]);
  const confidence = useMemo(() => getConfidenceSeries(id, stats), [id, stats]);

  return (
    <>
      <div className="card card-glass page-head">
        <div>
          <span className="chip chip-dark chip-wide">{t("detail.badge")}</span>
          <h2 className="page-title">{t("detail.title", { stream: name })}</h2>
          <p className="hint">{t("detail.subtitle")}</p>
        </div>
        <div className="page-head-side">
          <span className="hint">{t("detail.scanningSession")}</span>
          <span className="metric metric-purple">#{stats.sessionId + 1}-AI</span>
        </div>
      </div>

      <div className="split split-detail">
        <section className="split-side stack">
          <PredictionPanel sessionId={stats.sessionId} />
          <div className="grid grid-2 grid-tight">
            <StatTile label={t("detail.currentWinRate")} value={`${stats.aiWinRate.toFixed(1)}%`} />
            <StatTile label={t("detail.liveWinStreak")} value={`${stats.winStreak} 🔥`} tone="amber" />
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
