"use client";

import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { HISTORY_ROWS } from "@/src/lib/api/no-hu";
import { ChartIcon } from "../icons";

const SLOTS = HISTORY_ROWS + 1;   // 15 dòng trước + dòng hiện tại
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * Biểu đồ cột: mỗi cột là khả năng nổ hũ (confidence) của MỘT dòng lucky time ("ván"), cũ → mới, cột cuối là dòng hiện tại.
 * Cột hiện tại chỉ hiện sau khi user phân tích (`current` = null: ô nét đứt), nên không lộ số liệu chưa trả phí.
 * Huy hiệu xu hướng tính từ các dòng TRƯỚC (3 dòng gần nhất so với 3 dòng liền trước đó).
 */
export function LuckyTrendChart({ history, current }: { history: number[]; current: number | null }) {
  const { t } = useI18n();
  const bars: Array<number | null> = [...Array<null>(Math.max(0, HISTORY_ROWS - history.length)).fill(null), ...history, current];

  let trend: "up" | "down" | "flat" | null = null;
  if (history.length >= 6) {
    const d = avg(history.slice(-3)) - avg(history.slice(-6, -3));
    trend = d >= 4 ? "up" : d <= -4 ? "down" : "flat";
  }
  const at = (i: number) => `${((i + 0.5) / SLOTS) * 100}%`;
  const label = (i: number, text: string, edge?: "left" | "right") => (
    <span key={i} className={cn("absolute top-0 whitespace-nowrap", edge === "left" ? "" : edge === "right" ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: edge === "left" ? 0 : at(i) }}>{text}</span>
  );

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChartIcon className="h-5 w-5 text-neon" />
          <h3 className="font-display text-sm font-extrabold tracking-wide text-white md:text-base">{t("noHu.chartTitle")}</h3>
        </div>
        {trend && (
          <span className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold", trend === "up" ? "border-neon/50 bg-neon/20 text-neon-soft shadow-[0_0_8px_rgba(255,20,50,0.3)]" : "border-wire bg-white/5 text-slate-hud")}>
            {trend === "up" && <span className="h-2 w-2 animate-ping rounded-full bg-neon" />}
            {t(trend === "up" ? "noHu.trendUp" : trend === "down" ? "noHu.trendDown" : "noHu.trendFlat")}{trend === "up" ? " ↑" : trend === "down" ? " ↓" : ""}
          </span>
        )}
      </div>
      <div className="relative flex h-44 flex-1 items-end justify-between gap-1.5 overflow-hidden border-b border-wire px-2 pb-2 pt-6" style={{ backgroundSize: "20px 20px", backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)" }}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between opacity-20" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="w-full border-b border-zinc-500" />)}
        </div>
        {bars.map((v, i) => {
          const isCurrent = i === SLOTS - 1;
          if (v == null) {
            return <div key={i} className={cn("relative h-full w-full", isCurrent && "rounded-t border border-dashed border-gold/30")} aria-hidden="true" />;
          }
          return (
            <div key={i} className="flex h-full w-full items-end" title={`${v}%`}>
              <div
                className={cn("relative w-full origin-bottom animate-bar-grow rounded-t bg-ai-soft", isCurrent && "shadow-[0_0_12px_#34d399]")}
                style={{ height: `${v}%`, opacity: isCurrent ? 1 : 0.55 + 0.4 * (v / 100) }}
              >
                {isCurrent && (
                  <>
                    <span className="absolute -top-3 left-1/2 h-2.5 w-2.5 -translate-x-1/2 animate-ping rounded-full bg-gold-light" />
                    <span className="absolute -top-3 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-gold-light" />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative mt-2 h-4 font-mono text-[10px] text-slate-hud sm:text-xs">
        {label(0, t("noHu.roundsAgo", { count: 15 }), "left")}
        {label(5, t("noHu.roundsAgo", { count: 10 }))}
        {label(10, t("noHu.roundsAgo", { count: 5 }))}
        <span className="absolute right-0 top-0 flex items-center gap-1 font-bold text-ai-soft"><span className="h-1.5 w-1.5 rounded-full bg-ai" />{t("noHu.now")}</span>
      </div>
    </div>
  );
}
