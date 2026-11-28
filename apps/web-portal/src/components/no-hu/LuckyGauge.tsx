"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/src/i18n/provider";
import { useReducedMotion } from "@/src/hooks/use-reduced-motion";
import { cn } from "@/src/lib/cn";

const C = 439.82;   // chu vi r = 70
const DURATION_MS = 2800;

/** Vòng tròn "KHẢ NĂNG NỔ HŨ": chạy 0 → `percent` trong 2,8s (easeOutCubic) rồi đứng yên và phát sáng nhịp thở (theo Stitch). */
export function LuckyGauge({ percent }: { percent: number }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [p, setP] = useState(0);
  const done = p >= percent;

  useEffect(() => {
    if (reduced) { setP(percent); return; }
    let raf = 0, start: number | null = null;
    const step = (ts: number) => {
      start ??= ts;
      const k = Math.min((ts - start) / DURATION_MS, 1);
      setP((1 - Math.pow(1 - k, 3)) * percent);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [percent, reduced]);

  return (
    <div className="relative flex h-48 w-48 shrink-0 items-center justify-center sm:h-52 sm:w-52">
      <div className="pointer-events-none absolute h-36 w-36 animate-pulse rounded-full bg-ai/15 blur-2xl" />
      <svg className="h-full w-full -rotate-90 overflow-visible" viewBox="0 0 180 180" role="img" aria-label={`${Math.round(percent)}%`}>
        <defs>
          <filter id="luckyGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="luckyMarkerGlow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="4" result="g" /><feMerge><feMergeNode in="g" /><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="luckyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f5d4" /><stop offset="50%" stopColor="#00ff66" /><stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <circle cx="90" cy="90" r="78" fill="none" stroke="#27272a" strokeOpacity="0.4" strokeDasharray="2 6" strokeWidth="1" />
        <circle cx="90" cy="90" r="74" fill="none" stroke="#3f3f46" strokeOpacity="0.6" strokeDasharray="1.2 6.54" strokeWidth="2.5" />
        <circle cx="90" cy="90" r="70" fill="none" stroke="#27272a" strokeOpacity="0.7" strokeWidth="11" />
        <circle
          cx="90" cy="90" r="70" fill="none" stroke="url(#luckyGradient)" strokeWidth="11" strokeLinecap="round" filter="url(#luckyGlow)"
          strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)} className={cn(done && "animate-gauge-pulse")}
        />
        <circle cx="90" cy="90" r="56" fill="none" stroke="#10b981" strokeOpacity="0.2" strokeDasharray="3 4" strokeWidth="1" />
        <g transform={`rotate(${p * 3.6} 90 90)`}>
          <circle className="animate-endpoint-ping" cx="160" cy="90" r="4" fill="none" stroke="#6ee7b7" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
          <circle cx="160" cy="90" r="6.5" fill="#060608" stroke="#00ff66" strokeWidth="3" filter="url(#luckyMarkerGlow)" />
          <circle cx="160" cy="90" r="3.5" fill="#00ff66" />
          <circle cx="160" cy="90" r="2" fill="#fff" />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center text-center">
        <span className={cn("font-mono text-4xl font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.7)] sm:text-5xl", done && "animate-counter-pulse")}>{Math.round(p)}%</span>
        <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-300 sm:text-[11px]">
          <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-ai-soft" />{t("noHu.chance")}
        </span>
        <span className="mt-0.5 font-display text-sm font-black uppercase tracking-widest text-gold-light sm:text-base" style={{ textShadow: "0 0 10px rgba(255,200,50,0.7)" }}>{t("noHu.jackpot")}</span>
      </div>
    </div>
  );
}
