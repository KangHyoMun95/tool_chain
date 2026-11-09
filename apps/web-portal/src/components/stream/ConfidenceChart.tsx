"use client";

import { useI18n } from "@/src/i18n/provider";
import { ChartIcon } from "../icons";
import { HudCard } from "../ui/HudCard";

const W = 900;
const H = 135;
const X_PAD = 20;
const Y_MIN = 0;
const Y_MAX = 100;
const Y_TICKS = [100, 80, 60, 40, 20, 0];

export type ConfidencePoint = { key: string; label: string; value: number };   // value: phần trăm 0–100

/** Biểu đồ tỷ lệ thắng của các shoe gần nhất (mỗi điểm một shoe). Đường neon đỏ + chấm trắng viền đỏ. */
export function ConfidenceChart({ points }: { points: ConfidencePoint[] }) {
  const { t } = useI18n();
  const x = (i: number) => (points.length > 1 ? X_PAD + (i * (W - 2 * X_PAD)) / (points.length - 1) : W / 2);
  const y = (v: number) => H - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * H;
  const coords = points.map((p, i) => [x(i), y(p.value)] as const);

  return (
    <HudCard className="flex flex-col overflow-hidden p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChartIcon className="h-5 w-5 text-neon" />
          <h2 className="font-display text-sm font-extrabold tracking-wide text-white md:text-base">{t("live.chartTitle")}</h2>
        </div>
        <span className="rounded-full border border-neon/60 bg-red-950/80 px-3 py-1 font-mono text-[11px] font-bold text-gray-200 shadow-[0_0_8px_rgba(255,0,0,0.3)]">
          {t("live.chartRange", { count: points.length })}
        </span>
      </div>

      <div className="relative mt-1 flex h-[165px] w-full">
        <div className="flex select-none flex-col justify-between pb-5 pr-2 font-mono text-[11px] font-bold text-gray-400">
          {Y_TICKS.map((v) => <span key={v}>{v}</span>)}
        </div>
        <div className="relative flex flex-1 flex-col justify-between pb-5">
          {points.length === 0 && (
            <p className="absolute inset-0 z-20 flex items-center justify-center pb-5 text-xs text-gray-400">{t("live.chartEmpty")}</p>
          )}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-5">
            {Y_TICKS.map((v) => <div key={v} className="h-0 w-full border-b border-white/10" />)}
          </div>
          <svg className="absolute inset-0 z-10 h-full w-full overflow-visible pb-5" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t("live.chartSeries")}>
            <defs>
              <filter id="confidenceGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ff1e42" floodOpacity="0.9" />
              </filter>
            </defs>
            <polyline fill="none" stroke="#ff1e42" strokeWidth="3" filter="url(#confidenceGlow)" points={coords.map(([cx, cy]) => `${cx},${cy}`).join(" ")} />
            {coords.map(([cx, cy], i) => (
              <circle key={points[i].key} cx={cx} cy={cy} r="4.5" fill="#fff" stroke="#ff003b" strokeWidth="2.5">
                <title>{`${points[i].label}: ${points[i].value}%`}</title>
              </circle>
            ))}
          </svg>
          <div className="absolute inset-x-0 -bottom-1 flex justify-between font-mono text-[10px] font-semibold text-gray-300 md:text-[11px]">
            {points.map((p) => <span key={p.key}>{p.label}</span>)}
          </div>
        </div>
      </div>
    </HudCard>
  );
}
