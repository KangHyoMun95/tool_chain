"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import type { Stream } from "@/src/lib/api/catalog";
import { getStreamStats } from "@/src/lib/mock-stats";
import { RecentResultDots } from "./RecentResultDots";

export function StreamCard({ stream }: { stream: Stream }) {
  const { t } = useI18n();
  const stats = getStreamStats(stream.id);

  return (
    <div className="card card-dark card-hover stream-card">
      <div className="stream-head">
        <div>
          <h3 className="card-title-amber">{stream.name}</h3>
          {stream.streamerId && <p className="muted-on-dark">{t("streams.streamer", { name: stream.streamerId })}</p>}
          <p className="muted-on-dark">{t("streams.session", { id: stats.sessionId })}</p>
        </div>
        <span className="chip chip-live">
          <span className="live-dot" />
          {t("streams.live")}
        </span>
      </div>

      <div className="stat-pair">
        <div>
          <p className="micro-label">{t("categories.aiWinRate")}</p>
          <p className="metric metric-win">{stats.aiWinRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="micro-label">{t("streams.winStreak")}</p>
          <p className="metric metric-amber">{stats.winStreak} 🔥</p>
        </div>
      </div>

      <div>
        <p className="muted-on-dark small-gap">
          {t("streams.recentResults", { count: stats.recentResults.length })}
        </p>
        <RecentResultDots results={stats.recentResults} />
      </div>

      <Link href={`/streams/${stream.id}`} className="btn btn-amber btn-block">
        {t("streams.viewDetail")}
      </Link>
    </div>
  );
}
