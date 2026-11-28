"use client";

import { useRef, useState } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { fetchLuckyWindow, type LuckyDetails, type LuckyWindow } from "@/src/lib/api/no-hu";
import type { Category } from "@/src/lib/api/catalog";
import { ErrorState } from "../DataStates";
import { BackLink } from "../ui/BackLink";
import { HudCard } from "../ui/HudCard";
import { Spinner } from "../ui/Spinner";
import { GameDropdown } from "./GameDropdown";
import { LuckyAnalyzePanel } from "./LuckyAnalyzePanel";
import { LuckyTrendChart } from "./LuckyTrendChart";
import { NextRoundCountdown } from "./NextRoundCountdown";

/** Phần phân tích của MỘT dòng lucky time: key theo dòng nên sang dòng mới thì trạng thái "đã phân tích" tự reset. */
function Board({ categoryId, win }: { categoryId: string; win: LuckyWindow }) {
  const [details, setDetails] = useState<LuckyDetails | null>(win.details);
  return (
    <div className="grid w-full grid-cols-1 gap-3.5 lg:grid-cols-12">
      <HudCard glow className="p-5 sm:p-6 lg:col-span-5">
        <LuckyAnalyzePanel categoryId={categoryId} luckyTimeId={win.luckyTimeId} details={details} scheduleEmpty={win.scheduleEmpty} onUnlocked={setDetails} />
      </HudCard>
      <HudCard glow className="p-5 lg:col-span-7">
        <LuckyTrendChart history={win.history} current={details?.confidence ?? null} />
      </HudCard>
    </div>
  );
}

/**
 * Trang chi tiết category của lobby NỔ HŨ theo Stitch "Dự đoán Nổ Hũ". Danh sách game ở dropdown là category thật (API có sẵn);
 * lịch lucky time, phân tích và trừ phí hiện là mock (`lib/api/no-hu.ts`, API chưa làm), khóa theo `category.id`.
 */
export function NoHuDetail({ category }: { category: Category }) {
  const { t } = useI18n();
  const gameId = category.id;
  const win = useApi(() => fetchLuckyWindow(gameId), [gameId]);

  // Hết giờ ⇒ lấy lại dòng hiện tại. Trong lúc tải giữ dữ liệu cũ để màn hình không nhấp nháy.
  const last = useRef<{ gameId: string; win: LuckyWindow } | null>(null);
  if (win.status === "success") last.current = { gameId, win: win.data };
  const shown = win.status === "success" ? win.data : last.current?.gameId === gameId ? last.current.win : null;

  return (
    <>
      <HudCard className="relative z-30 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-neon" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l5-3.5z" /></svg>
            {t("noHu.selectGame")}
          </span>
          <GameDropdown lobbyId={category.lobbyId} currentId={category.id} currentName={category.name} />
          {shown?.nextAt != null && <NextRoundCountdown nextAt={shown.nextAt} onElapsed={win.reload} />}
        </div>
        <BackLink href={`/lobbies/${category.lobbyId}`} label={t("nav.backToLobbies")} />
      </HudCard>
      {win.status === "error" && !shown ? (
        <ErrorState error={win.error} onRetry={win.reload} />
      ) : shown ? (
        <Board key={`${gameId}|${shown.luckyTimeId ?? "none"}`} categoryId={gameId} win={shown} />
      ) : (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 border-neon/30 border-t-neon" /></div>
      )}
    </>
  );
}
