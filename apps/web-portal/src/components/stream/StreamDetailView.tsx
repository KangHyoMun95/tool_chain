"use client";

import { useMemo } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useStreamSession } from "@/src/hooks/use-stream-session";
import { useI18n } from "@/src/i18n/provider";
import { getStream, type Stream } from "@/src/lib/api/catalog";
import { parseStreamer } from "@/src/lib/streamer";
import { stagger } from "@/src/lib/stagger";
import { PageBanner } from "../catalog/PageBanner";
import { PageBannerSkeleton, StreamDetailSkeleton } from "../catalog/Skeletons";
import { ErrorState } from "../DataStates";
import { ChartIcon } from "../icons";
import { NotFoundView } from "../NotFoundView";
import { AppShell } from "../shell/AppShell";
import { HudCard } from "../ui/HudCard";
import type { ConnectionState } from "../ui/StatusBadge";
import { ConfidenceChart, type ConfidencePoint } from "./ConfidenceChart";
import { PredictionPanel } from "./PredictionPanel";
import { SessionHistory } from "./SessionHistory";
import { StreamDebugPanel } from "./StreamDebugPanel";
import { StreamerBoard } from "./StreamerBoard";

const LEFT = "animate-slide-in-left";
const RIGHT = "animate-slide-in-right";

export function StreamDetailView({ streamId }: { streamId: string }) {
  const stream = useApi(() => getStream(streamId), [streamId]);

  let body;
  if (stream.status === "loading") body = <><PageBannerSkeleton /><StreamDetailSkeleton /></>;
  else if (stream.status === "error") {
    body = stream.error.status === 404 || stream.error.status === 400
      ? <NotFoundView />
      : <ErrorState error={stream.error} onRetry={stream.reload} />;
  } else body = <StreamDetail stream={stream.data} />;

  return <AppShell>{body}</AppShell>;
}

function StreamDetail({ stream }: { stream: Stream }) {
  const { id } = stream;
  const { t } = useI18n();
  const live = useStreamSession(stream);
  const statusLabel = t(`live.status.${live.status ?? "none"}`);
  // Huy hiệu ở banner: xanh = SSE đang kết nối, đỏ = mất kết nối đang thử lại, xám = chưa/không có kết nối.
  const state: ConnectionState = live.connection === "live" ? "live" : live.connection === "reconnecting" ? "reconnecting" : "offline";
  // Tên + quốc gia streamer: ưu tiên realtime, dự phòng từ streamer_id của API ("Tên/Quốc gia/Mã").
  const fallback = parseStreamer(stream.streamerId);
  // Tỷ lệ thắng / chuỗi thắng / độ tin cậy: dữ liệu thật từ GET /streams/:id/predictions/stats (null khi chưa tải xong).
  const stats = live.stats;
  const confidence = useMemo<ConfidencePoint[]>(
    () => (stats?.recent ?? []).map((r) => ({ key: `${r.shoe}:${r.round}`, label: `#${r.round}`, value: Math.round(r.confidence * 1000) / 10 })),
    [stats],
  );
  const evaluated = stats ? stats.wins + stats.losses : 0;
  const streak = stats?.win_streak ?? 0;

  return (
    <>
      <PageBanner title={`${stream.categoryName} ${stream.name}`} backHref={`/categories/${stream.categoryId}`} backLabel="nav.backToStreams" state={state} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className={LEFT} style={stagger(0, 0, 100)}>
            <PredictionPanel streamId={id} connection={live.connection} shoe={live.shoe} round={live.round} status={live.latest?.status ?? null} statusLabel={statusLabel} result={live.result} />
          </div>
          <div className={LEFT} style={stagger(0, 0, 200)}>
            <StreamerBoard name={live.streamerName ?? fallback.name} country={live.country ?? fallback.country} rows={live.history.rows} totals={live.totals} />
          </div>
          <div className={`grid grid-cols-2 gap-3 ${LEFT}`} style={stagger(0, 0, 300)}>
            <HudCard className="flex flex-col justify-between p-3 text-center">
              <span className="flex items-center justify-center gap-2 font-mono text-[10px] font-bold uppercase text-gray-300 md:text-[11px]">
                <ChartIcon className="h-4 w-4 text-neon" />
                {t("live.winRate")}
              </span>
              <span className="mt-1 font-mono text-2xl font-black tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] md:text-3xl">
                {stats?.win_rate == null ? "—" : `${(stats.win_rate * 100).toFixed(1)}%`}
              </span>
              <span className="font-mono text-[9px] text-gray-400">{t("live.winRateSample", { count: evaluated })}</span>
            </HudCard>
            <HudCard className="flex flex-col justify-between p-3 text-center">
              <span className="font-mono text-[10px] font-bold uppercase text-gray-300 md:text-[11px]">{t("live.winStreak")}</span>
              <span className="mt-1 flex items-center justify-center gap-2 font-mono text-2xl font-black text-white md:text-3xl">
                {streak > 0 && <span className="animate-bounce text-xl">🔥</span>}
                {stats ? streak : "—"}
                {streak > 0 && <span className="animate-bounce text-xl">🔥</span>}
              </span>
            </HudCard>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-7">
          <div className={RIGHT} style={stagger(0, 0, 150)}>
            <ConfidenceChart points={confidence} />
          </div>
          <div className={RIGHT} style={stagger(0, 0, 250)}>
            <SessionHistory streamId={id} rows={live.history.rows} error={live.history.error} />
          </div>
        </div>
      </div>

      <StreamDebugPanel data={live.latest} />
    </>
  );
}
