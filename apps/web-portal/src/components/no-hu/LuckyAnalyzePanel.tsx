"use client";

import { useState } from "react";
import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { ApiError } from "@/src/lib/api/client";
import { unlockLucky, type LuckyDetails } from "@/src/lib/api/no-hu";
import { Radar } from "../ui/Radar";
import { LuckyGauge } from "./LuckyGauge";

type Props = {
  categoryId: string;
  luckyTimeId: string | null;
  /** null = chưa bấm phân tích dòng hiện tại. */
  details: LuckyDetails | null;
  /** Category không có lịch: nút phân tích bị khóa. */
  scheduleEmpty: boolean;
  onUnlocked: (d: LuckyDetails) => void;
  /** 409: dòng hiện tại đã đổi (sang khung mới / HOST import lại) ⇒ tải lại lịch. */
  onStale: () => void;
};

const INNER = "flex min-h-[220px] w-full flex-1 flex-col rounded-xl border border-neon/25 bg-module/85 p-3 shadow-[inset_0_0_15px_rgba(255,20,60,0.06)] backdrop-blur-xl";

function Row({ icon, label, children, index }: { icon: string; label: string; children: React.ReactNode; index: number }) {
  return (
    <div className="flex animate-lucky-row-in items-center justify-between gap-3 py-2" style={{ animationDelay: `${150 + index * 150}ms` }}>
      <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 sm:text-xs"><span className="text-xs text-gold-light" aria-hidden="true">{icon}</span>{label}</span>
      <span className="min-h-4 text-right text-xs font-bold">{children}</span>
    </div>
  );
}

/** Khung trái: nút phân tích (vàng) → radar → vòng tròn + kết quả. Mọi ô rỗng (null) để trống. */
export function LuckyAnalyzePanel({ categoryId, luckyTimeId, details, scheduleEmpty, onUnlocked, onStale }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"insufficient" | "failed" | null>(null);

  const analyze = async () => {
    if (busy || scheduleEmpty || !luckyTimeId) return;
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await unlockLucky(categoryId, luckyTimeId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { onStale(); return; }
      setError(e instanceof ApiError && e.status === 402 && e.code === "INSUFFICIENT_BALANCE" ? "insufficient" : "failed");
    } finally {
      setBusy(false);
    }
  };

  if (details) {
    const best = details.traceNextCircle != null
      ? t("noHu.nextRounds", { count: details.traceNextCircle })
      : details.rangeFrom != null && details.rangeTo != null ? t("noHu.withinMinutes", { from: details.rangeFrom, to: details.rangeTo }) : "";
    const cycle = details.circleFrom != null && details.circleTo != null ? t("noHu.cycleRange", { from: details.circleFrom, to: details.circleTo }) : "";
    return (
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-stretch">
        <LuckyGauge percent={details.confidence} />
        <div className={INNER}>
          <div className="mb-1 flex items-center gap-2 border-b border-neon/20 pb-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ai/20 text-xs text-ai-soft">✓</span>
            <h3 className="font-display text-xs font-bold tracking-wide text-white sm:text-sm">{t("noHu.resultTitle")}</h3>
          </div>
          <div className="flex flex-1 flex-col justify-between divide-y divide-neon/10">
            <Row index={0} icon="📦" label={t("noHu.trend")}><span className="text-ai-soft" style={{ textShadow: "0 0 8px rgba(0,255,102,0.6)" }}>{details.indicator ?? ""}</span></Row>
            <Row index={1} icon="🎁" label={t("noHu.cycle")}><span className="font-mono text-gold-light">{cycle}</span></Row>
            <Row index={2} icon="⏰" label={t("noHu.bestTime")}><span className="text-gold">{best}</span></Row>
            <Row index={3} icon="⚡" label={t("noHu.rtp")}><span className="font-mono font-extrabold text-white">{details.rtp != null ? `${details.rtp}%` : ""}</span></Row>
          </div>
        </div>
      </div>
    );
  }

  const disabled = scheduleEmpty || busy;
  return (
    <div className="flex flex-col items-center gap-5 md:flex-row md:items-stretch">
      <div className="relative flex shrink-0 flex-col items-center justify-center self-center py-3">
        {!disabled && (
          <>
            <span className="pointer-events-none absolute h-52 w-52 animate-spin rounded-full border border-dashed border-gold-light/50 shadow-[0_0_20px_rgba(245,158,11,0.35)] sm:h-56 sm:w-56" style={{ animationDuration: "22s" }} />
            <span className="pointer-events-none absolute h-44 w-44 animate-lucky-shockwave rounded-full border-2 border-gold-light/70 sm:h-48 sm:w-48" />
            <span className="pointer-events-none absolute h-44 w-44 animate-lucky-shockwave rounded-full border-2 border-gold-light/50 sm:h-48 sm:w-48" style={{ animationDelay: "0.15s" }} />
          </>
        )}
        {busy ? (
          <div className="flex h-44 w-44 flex-col items-center justify-center gap-1 sm:h-48 sm:w-48" role="status">
            <Radar size={150} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neon">{t("noHu.analyzing")}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={analyze}
            disabled={disabled}
            className={cn(
              "group relative flex h-44 w-44 select-none flex-col items-center justify-center rounded-full border-[3px] p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-light sm:h-48 sm:w-48",
              disabled ? "cursor-not-allowed border-zinc-600 opacity-60 grayscale" : "animate-lucky-btn-click cursor-pointer border-gold-light",
            )}
            style={{
              background: "radial-gradient(circle at 35% 30%, rgb(120,53,15) 0%, rgb(69,26,3) 50%, rgb(20,10,2) 100%)",
              boxShadow: disabled ? undefined : "0 0 25px rgba(245,158,11,0.8), inset 0 2px 5px rgba(254,240,138,0.6), inset 0 -6px 12px rgba(0,0,0,0.85), inset 0 0 22px rgba(217,119,6,0.45)",
            }}
          >
            <span className="pointer-events-none absolute inset-2 rounded-full border border-gold-light/40 bg-gradient-to-b from-white/15 to-transparent" />
            <span className="pointer-events-none absolute inset-3.5 rounded-full border border-gold/50" />
            <span className="relative z-10 mb-1.5 flex h-14 w-14 items-center justify-center rounded-full border border-gold-light/80 bg-gradient-to-b from-gold-light/30 to-amber-950/80 shadow-[0_0_18px_rgba(245,158,11,0.8)] sm:h-16 sm:w-16">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 animate-pulse text-amber-200 drop-shadow-[0_0_10px_rgba(254,240,138,0.95)] sm:h-8 sm:w-8" aria-hidden="true"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </span>
            <span className="relative z-10 flex flex-col items-center text-center leading-tight">
              <span className="font-display text-xs font-black uppercase tracking-widest text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.85)] sm:text-sm">{t("noHu.analyzeStart")}</span>
              <span className="font-display text-xs font-black uppercase tracking-wider text-gold-light sm:text-sm">{t("noHu.analyzeLabel")}</span>
              {!scheduleEmpty && (
                <span className="mt-1 flex items-center gap-1 rounded-full border border-gold/50 bg-amber-950/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-gold-light">
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-gold-light" />{t("noHu.ready")}
                </span>
              )}
            </span>
          </button>
        )}
      </div>
      <div className={cn(INNER, "relative items-center justify-center overflow-hidden p-5 text-center")}>
        <div className="relative z-10 flex max-w-[280px] flex-col items-center gap-3.5">
          {!scheduleEmpty && (
            <div className="flex h-14 w-14 animate-nudge-left items-center justify-center rounded-2xl border border-neon/40 bg-gradient-to-tr from-red-950/70 to-neon/20 shadow-[0_0_20px_rgba(255,16,63,0.35)] sm:h-16 sm:w-16">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-neon-soft drop-shadow-[0_0_8px_rgba(255,30,70,0.8)]" aria-hidden="true"><path d="m11 19-7-7 7-7m8 14-7-7 7-7" /></svg>
            </div>
          )}
          <div className="flex flex-col items-center gap-1.5">
            {scheduleEmpty ? (
              <>
                <h3 className="font-display text-base font-black uppercase tracking-wide text-white sm:text-lg">{t("noHu.noSchedule")}</h3>
                <p className="max-w-[240px] text-xs leading-relaxed text-zinc-400">{t("noHu.noScheduleDescription")}</p>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-2 rounded-full border border-neon/40 bg-neon/15 px-3 py-1 shadow-[0_0_12px_rgba(255,20,50,0.25)]">
                  <span className="h-2 w-2 animate-ping rounded-full bg-neon" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-neon-soft">{t("noHu.waitTitle")}</span>
                </span>
                <h3 className="font-display text-base font-black uppercase tracking-wide text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.7)] sm:text-lg">{t("noHu.waitHeading")}</h3>
                <p className="max-w-[240px] text-xs font-medium leading-relaxed text-zinc-400">{t("noHu.waitDescription")}</p>
              </>
            )}
            {error && <p className="mt-1 text-xs font-semibold text-red-300" role="alert">{t(error === "insufficient" ? "noHu.insufficient" : "noHu.analyzeError")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
