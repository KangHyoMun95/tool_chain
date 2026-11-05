"use client";

import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { countryFlag } from "@/src/lib/country-flag";
import type { HistoryRow } from "@/src/hooks/use-stream-history";
import type { Totals } from "@/src/hooks/use-stream-session";
import { HudCard } from "../ui/HudCard";

const COLS = 10;
const ROWS = 6;
const SIZE = COLS * ROWS;
const BEAD = { B: "bg-bead-b", P: "bg-bead-p", T: "bg-bead-t" } as const;
const PILL = { B: "bg-bead-b shadow-[0_0_8px_rgba(239,68,68,0.7)]", P: "bg-bead-p shadow-[0_0_8px_rgba(59,130,246,0.7)]", T: "bg-bead-t shadow-[0_0_8px_rgba(34,197,94,0.7)]" } as const;

type Props = {
  name: string | null;
  country: string | null;
  rows: HistoryRow[];        // round giảm dần
  totals: Totals | null;
};

/** Streamer (tên + cờ emoji), bảng hạt cầu 6 hàng x 10 cột (60 ván gần nhất, điền theo cột) và số liệu B / P / T realtime. */
export function StreamerBoard({ name, country, rows, totals }: Props) {
  const { t } = useI18n();
  const cells = rows.filter((r) => r.result !== null).slice(0, SIZE).reverse();   // cũ → mới

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
              const r = cells[i]?.result;
              const bead = r === "B" || r === "P" || r === "T" ? r : null;
              return (
                <span
                  key={i}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] font-black",
                    bead ? cn(BEAD[bead], "shadow-[inset_0_-2px_4px_rgba(0,0,0,0.5)]") : r ? "bg-gray-500" : "border border-white/20",
                  )}
                >
                  {bead ?? (r ? "?" : "")}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5 pt-1 font-mono">
        {(["B", "P", "T"] as const).map((k) => (
          <span key={k} className={cn("rounded-full px-4 py-1 text-xs font-black text-white", PILL[k])}>
            {k}: {totals ? totals[k] : "—"}
          </span>
        ))}
      </div>
    </HudCard>
  );
}
