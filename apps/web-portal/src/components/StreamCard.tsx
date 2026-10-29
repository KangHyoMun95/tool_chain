"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import type { Stream } from "@/src/lib/portal-data";
import { RecentResultDots } from "./RecentResultDots";

export function StreamCard({ stream }: { stream: Stream }) {
  const { t } = useI18n();

  return (
    <div className="card card-dark card-hover stream-card">
      <div className="stream-head">
        <div>
          <h3 className="card-title-amber">{stream.name}</h3>
          <p className="muted-on-dark">{t("streams.session", { id: stream.sessionId })}</p>
        </div>
        <span className="chip chip-live">
          <span className="live-dot" />
          {t("streams.live")}
        </span>
      </div>

      <div className="stat-pair">
        <div>
          <p className="micro-label">{t("categories.aiWinRate")}</p>
          <p className="metric metric-win">{stream.aiWinRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="micro-label">{t("streams.winStreak")}</p>
          <p className="metric metric-amber">{stream.winStreak} 🔥</p>
        </div>
      </div>

      <div>
        <p className="muted-on-dark small-gap">
          {t("streams.recentResults", { count: stream.recentResults.length })}
        </p>
        <RecentResultDots results={stream.recentResults} />
      </div>

      <Link href={`/streams/${stream.id}`} className="btn btn-amber btn-block">
        {t("streams.viewDetail")}
      </Link>
    </div>
  );
}
