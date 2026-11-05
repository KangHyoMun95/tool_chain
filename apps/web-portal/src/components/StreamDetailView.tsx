"use client";

import { useMemo } from "react";
import { useStreamSession } from "@/src/hooks/use-stream-session";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { getStream, type Stream } from "@/src/lib/api/catalog";
import { getConfidenceSeries, getStreamStats } from "@/src/lib/mock-stats";
import { ConfidenceChart } from "./ConfidenceChart";
import { ErrorState, LoadingState } from "./DataStates";
import { NotFoundView } from "./NotFoundView";
import { PortalShell } from "./PortalShell";
import { PredictionPanel } from "./PredictionPanel";
import { LiveBoard } from "./LiveBoard";
import { SessionHistory } from "./SessionHistory";
import { StatTile } from "./StatTile";
import { StreamDebugPanel } from "./StreamDebugPanel";

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
      {stream.status === "success" && <StreamDetail stream={stream.data} />}
    </PortalShell>
  );
}

function StreamDetail({ stream }: { stream: Stream }) {
  const { id, name } = stream;
  const { t } = useI18n();
  const live = useStreamSession(stream);
  // chấm Live: xanh = SSE đang kết nối, đỏ = lỗi đang thử lại, xám = chưa/không có kết nối
  const tone = live.connection === "live" ? "on" : live.connection === "reconnecting" ? "error" : "off";
  const statusLabel = t(`live.status.${live.status ?? "none"}` as "live.status.none");
  // TODO: số liệu AI giả lập (src/lib/mock-stats.ts), chưa có API prediction.
  const stats = useMemo(() => getStreamStats(id), [id]);
  const confidence = useMemo(() => getConfidenceSeries(id, stats), [id, stats]);

  return (
    <>
      <div className="card card-glass page-head">
        <div>
          <span className={`chip chip-live chip-live-${tone}`} title={t(`live.connection.${live.connection}` as "live.connection.live")}>
            <span className="live-dot" />
            {t("streams.live")}
          </span>
          <h2 className="page-title">{stream.categoryName} {name}</h2>
        </div>
      </div>

      <div className="split split-detail">
        <section className="split-side stack">
          <PredictionPanel streamId={id} connection={live.connection} shoe={live.shoe} round={live.round} status={live.latest?.status ?? null} statusLabel={statusLabel} result={live.result} />
          <LiveBoard country={live.country} totals={live.totals} rows={live.history.rows} />
          <div className="lgrid grid-2 grid-tight">
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

          <SessionHistory streamId={id} shoe={live.history.shoe} rows={live.history.rows} error={live.history.error} />
          <StreamDebugPanel data={live.latest} />
        </section>
      </div>
    </>
  );
}
