"use client";

import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { countryFlag } from "@/src/lib/country-flag";
import { glow, symbolView, textOn, type ResultConfig } from "@/src/lib/result-config";
import type { HistoryRow } from "@/src/hooks/use-stream-history";
import type { Totals } from "@/src/hooks/use-stream-session";
import { HudCard } from "../ui/HudCard";

const COLS = 10;
const ROWS = 6;
const SIZE = COLS * ROWS;

type Props = {
  name: string | null;
  country: string | null;
  rows: HistoryRow[];        // round giảm dần
  totals: Totals | null;     // tick.totals; null = tick không có ⇒ ẩn khung tỉ lệ
  config: ResultConfig | null;
};

/**
 * Streamer (tên + cờ emoji), bảng hạt cầu 6 hàng x 10 cột (60 ván gần nhất, điền theo cột) và khung tỉ lệ realtime.
 * Hạt = màu + ký hiệu lấy từ cấu hình category (ký hiệu bất kỳ đều hiển thị được); khung tỉ lệ chỉ gồm các ký hiệu trong `totals`
 * của cấu hình, số lấy từ tick.totals (không tự đếm).
 */
export function StreamerBoard({ name, country, rows, totals, config }: Props) {
  const { t, locale } = useI18n();
  const cells = rows.filter((r) => r.result !== null).slice(0, SIZE).reverse();   // cũ → mới
  const pills = totals && config ? config.totals : [];

  return (
    <HudCard className="flex flex-col gap-2.5 overflow-hidden p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-[110px] flex-col items-center justify-center px-2 py-1">
          <span className="mb-1 max-w-[9rem] truncate text-center font-display text-xs font-extrabold uppercase tracking-wide text-amber-300 drop-shadow-[0_0_8px_#ffd700] md:text-sm">{name ?? "—"}</span>
          <span className="flex h-[66px] w-[110px] items-center justify-center rounded-lg border border-white/20 bg-black/40 text-5xl shadow-[0_0_10px_rgba(255,255,255,0.2)]" title={country ?? undefined}>
            {countryFlag(country)}
          </span>
        </div>

        <div className="flex-1 overflow-x-auto rounded-lg border border-red-900/50 bg-black/60 p-2">
          <div className="mx-auto grid w-max grid-flow-col grid-rows-6 gap-1.5" role="img" aria-label={t("live.boardLabel")}>
            {Array.from({ length: SIZE }, (_, i) => {
              const r = cells[i]?.result ?? null;
              const view = r !== null ? symbolView(config, r, locale) : null;
              return (
                <span
                  key={i}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] font-black",
                    !view && "border border-white/20",
                  )}
                  style={view ? { backgroundColor: view.color, color: textOn(view.color), boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.5)" } : undefined}
                  title={view?.known ? view.label : undefined}
                >
                  {view ? (view.known ? r : "?") : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {pills.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1 font-mono">
          {pills.map((s) => {
            const view = symbolView(config, s, locale);
            return (
              <span
                key={s}
                className="rounded-full px-4 py-1 text-xs font-black"
                style={{ backgroundColor: view.color, color: textOn(view.color), boxShadow: glow(view.color) }}
              >
                {view.label}: {totals && typeof totals[s] === "number" ? totals[s] : "—"}
              </span>
            );
          })}
        </div>
      )}
    </HudCard>
  );
}
