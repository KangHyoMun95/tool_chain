"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import type { Stream } from "@/src/lib/api/catalog";
import type { StreamListStatsDto } from "@/src/lib/api/predictions";
import { stagger } from "@/src/lib/stagger";

/**
 * Thẻ bàn ở danh sách. Số liệu AI lấy từ GET /categories/:id/stream-stats; tỷ lệ win là của shoe hiện tại.
 * canParticipate = false (me.can_participate do API tính) ⇒ khóa nút vào trang chi tiết (vào trang = bị trừ tiền).
 */
export function StreamCard({ stream, stats, index, canParticipate = true }: { stream: Stream; stats?: StreamListStatsDto; index: number; canParticipate?: boolean }) {
  const { t } = useI18n();
  const live = stats?.live ?? false;
  const title = `${stream.categoryName} ${stream.name}`;   // giống tiêu đề trang chi tiết

  return (
    <article
      className="flex animate-card-in flex-col justify-between rounded-2xl border-[1.5px] border-[rgba(255,38,62,0.7)] bg-[#101015] p-4 shadow-[0_0_18px_rgba(255,30,60,0.3),inset_0_0_12px_rgba(255,30,60,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#ff2a4b] hover:shadow-[0_0_24px_rgba(255,40,70,0.55),inset_0_0_16px_rgba(255,30,60,0.15)]"
      style={stagger(index, 100, 50)}
    >
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-gray-800/80 pb-2">
          <span className="truncate font-mono text-2xl font-black tracking-tight text-neon" title={title}>{title}</span>
          {live ? (
            <span className="inline-flex shrink-0 animate-live-pulse items-center gap-1.5 rounded-full border border-emerald-500/50 bg-[#0d2a1a] px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.8)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {t("streams.live")}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-600/60 bg-[#1a1a22] px-2.5 py-0.5 font-mono text-[11px] font-bold text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
              {t("streams.offline")}
            </span>
          )}
        </div>

        <div className="mt-2 font-mono text-[11px] font-medium leading-relaxed text-gray-400">
          {stream.streamerId && <p className="truncate">{t("streams.streamer", { name: stream.streamerId })}</p>}
          <p>
            {stats?.shoe != null && stats.round != null
              ? t("streams.session", { shoe: stats.shoe, round: stats.round })
              : t("streams.noSession")}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-gray-800/80 bg-[#15151e] p-2.5">
          <div className="text-center">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t("streams.winRate")}</span>
            <span className="mt-0.5 block font-mono text-2xl font-black leading-tight text-neon">{stats?.win_rate == null ? "—" : `${(stats.win_rate * 100).toFixed(1)}%`}</span>
          </div>
          <div className="border-l border-gray-800 text-center">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t("streams.winStreak")}</span>
            <span className="mt-0.5 flex items-center justify-center gap-1 font-mono">
              <span className="text-2xl font-black leading-tight text-neon">{stats?.win_streak ?? "—"}</span>
              {(stats?.win_streak ?? 0) > 0 && <span className="text-lg">🔥</span>}
            </span>
          </div>
        </div>
      </div>

      {canParticipate ? (
      <Link
        href={`/streams/${stream.id}`}
        className="btn-fx mt-4 flex w-full select-none items-center justify-center gap-1 rounded-xl py-2.5 text-center text-xs font-bold text-white shadow-[0_0_14px_rgba(255,30,66,0.6)] md:text-sm"
        style={{ background: "linear-gradient(90deg, #ff1e42 0%, #b91c1c 100%)" }}
      >
        <span className="relative z-10">{t("streams.viewDetail")}</span> <span className="fx-arrow-right relative z-10 text-base leading-none">→</span>
      </Link>
      ) : (
        <span
          aria-disabled="true"
          className="mt-4 flex w-full cursor-not-allowed select-none items-center justify-center rounded-xl border border-gray-700 bg-[#1a1a22] py-2.5 text-center text-xs font-bold text-gray-400 md:text-sm"
        >
          {t("streams.insufficientBalance")}
        </span>
      )}
    </article>
  );
}
