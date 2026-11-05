"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import type { Stream } from "@/src/lib/api/catalog";
import { getStreamStats } from "@/src/lib/mock-stats";
import { stagger } from "@/src/lib/stagger";
import { ResultBeads } from "../ResultBeads";

/** Thẻ bàn ở danh sách. Số liệu AI (phiên, tỷ lệ win, chuỗi thắng, 10 lượt gần nhất) vẫn là dữ liệu giả lập. */
export function StreamCard({ stream, index }: { stream: Stream; index: number }) {
  const { t } = useI18n();
  const stats = getStreamStats(stream.id);
  const title = `${stream.categoryName} ${stream.name}`;   // giống tiêu đề trang chi tiết

  return (
    <article
      className="flex animate-card-in flex-col justify-between rounded-2xl border-[1.5px] border-[rgba(255,38,62,0.7)] bg-[#101015] p-4 shadow-[0_0_18px_rgba(255,30,60,0.3),inset_0_0_12px_rgba(255,30,60,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#ff2a4b] hover:shadow-[0_0_24px_rgba(255,40,70,0.55),inset_0_0_16px_rgba(255,30,60,0.15)]"
      style={stagger(index, 100, 50)}
    >
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-gray-800/80 pb-2">
          <span className="truncate font-mono text-2xl font-black tracking-tight text-neon" title={title}>{title}</span>
          <span className="inline-flex shrink-0 animate-live-pulse items-center gap-1.5 rounded-full border border-emerald-500/50 bg-[#0d2a1a] px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.8)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t("streams.live")}
          </span>
        </div>

        <div className="mt-2 font-mono text-[11px] font-medium leading-relaxed text-gray-400">
          {stream.streamerId && <p className="truncate">{t("streams.streamer", { name: stream.streamerId })}</p>}
          <p>{t("streams.session", { id: stats.sessionId })}</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-gray-800/80 bg-[#15151e] p-2.5">
          <div className="text-center">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t("streams.winRate")}</span>
            <span className="mt-0.5 block font-mono text-2xl font-black leading-tight text-neon">{stats.aiWinRate.toFixed(1)}%</span>
          </div>
          <div className="border-l border-gray-800 text-center">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t("streams.winStreak")}</span>
            <span className="mt-0.5 flex items-center justify-center gap-1 font-mono">
              <span className="text-2xl font-black leading-tight text-neon">{stats.winStreak}</span>
              <span className="text-lg">🔥</span>
            </span>
          </div>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block font-mono text-[11px] font-semibold text-gray-300">{t("streams.recentResults", { count: stats.recentResults.length })}</span>
          <ResultBeads results={stats.recentResults} />
        </div>
      </div>

      <Link
        href={`/streams/${stream.id}`}
        className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl py-2.5 text-center text-xs font-bold text-white shadow-[0_0_14px_rgba(255,30,66,0.6)] transition-all hover:brightness-110 md:text-sm"
        style={{ background: "linear-gradient(90deg, #ff1e42 0%, #b91c1c 100%)" }}
      >
        {t("streams.viewDetail")} <span className="text-base leading-none">→</span>
      </Link>
    </article>
  );
}
