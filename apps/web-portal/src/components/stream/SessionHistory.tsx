"use client";

import { GemIcon, CheckIcon } from "../icons";
import { useI18n } from "@/src/i18n/provider";
import type { HistoryRow } from "@/src/hooks/use-stream-history";
import { cn } from "@/src/lib/cn";
import { mockPredictionSync } from "@/src/lib/prediction-source";
import { HudCard } from "../ui/HudCard";

const SHOWN = 10;   // 5 cột x 2 hàng

type Props = { streamId: string; rows: HistoryRow[]; error: boolean };   // rows: round giảm dần

/** 10 ván gần nhất của shoe hiện tại: `dự đoán → kết quả` + THẮNG / THUA / HÒA. */
export function SessionHistory({ streamId, rows, error }: Props) {
  const { t } = useI18n();

  return (
    <HudCard className="flex flex-col gap-3 overflow-hidden p-3.5">
      <div className="flex items-center gap-2">
        <GemIcon className="h-4 w-4 text-gold-light drop-shadow-[0_0_6px_#f59e0b]" />
        <h3 className="font-display text-sm font-black tracking-wide text-white md:text-base">{t("live.historyTitle")}</h3>
      </div>
      {error && <p className="text-xs text-red-300">{t("live.historyError")}</p>}
      {rows.length === 0 && !error && <p className="text-xs text-gray-400">{t("live.historyEmpty")}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {rows.slice(0, SHOWN).map((r) => {
          const pick = mockPredictionSync(streamId, r.shoe, r.round).pick;
          const tone = r.result === "T" ? "draw" : r.result !== null && pick === r.result ? "win" : "loss";
          return (
            <div
              key={`${r.shoe}:${r.round}`}
              className={cn(
                "flex flex-col items-center justify-between gap-0.5 rounded-lg border p-1.5 text-center",
                tone === "win" && "border-green-500/40 bg-green-950/20",
                tone === "loss" && "border-red-900/60 bg-black/60",
                tone === "draw" && "border-gray-700/60 bg-black/60",
              )}
            >
              <span className="font-mono text-[9px] font-medium text-gray-400">{t("live.session", { shoe: r.shoe, round: r.round })}</span>
              <span className="font-mono text-xs font-black tracking-wider text-white">{pick} → {r.result ?? "—"}</span>
              <span
                className={cn(
                  "flex w-full items-center justify-center gap-0.5 rounded py-0.5 font-mono text-[9px] font-extrabold uppercase",
                  tone === "win" && "bg-green-600/80 shadow-[0_0_5px_#22c55e]",
                  tone === "loss" && "bg-red-600/90 shadow-[0_0_4px_#ef4444]",
                  tone === "draw" && "border border-gray-600 bg-gray-800 text-gray-200",
                )}
              >
                {tone === "win" && <CheckIcon className="h-2.5 w-2.5" />}
                {tone === "win" ? t("live.win") : tone === "loss" ? t("live.lose") : t("live.tie")}
              </span>
            </div>
          );
        })}
      </div>
    </HudCard>
  );
}
