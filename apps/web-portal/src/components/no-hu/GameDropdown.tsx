"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { listCategories } from "@/src/lib/api/catalog";
import { cn } from "@/src/lib/cn";
import { CheckIcon } from "../icons";
import { SlugImage } from "../ui/SlugImage";

/**
 * Chọn game = chọn category của lobby NỔ HŨ (cột "Tên game" của file import chính là tên category). Danh sách lấy từ API thật
 * (`GET /categories?lobby_id=`); đổi game = sang trang `/no-hu/<category_id>`. Thumbnail: `public/images/categories/<slug tên>.png`
 * (cùng quy ước với thẻ category, xem `SlugImage` / `slugify`); chưa có file thì hiện ô chữ cái đầu.
 */
export function GameDropdown({ lobbyId, currentId, currentName }: { lobbyId: string; currentId: string; currentName: string }) {
  const { t } = useI18n();
  const games = useApi(() => listCategories(lobbyId), [lobbyId]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Chưa tải xong danh sách: chỉ có game đang mở.
  const items = games.status === "success" ? games.data : [{ id: currentId, name: currentName }];

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-xl border border-neon/40 bg-module px-2.5 py-1.5 text-xs font-semibold text-white shadow-inner transition-all hover:border-neon/80 hover:shadow-neon-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-soft md:text-sm"
      >
        <SlugImage kind="categories" name={currentName} className="h-7 w-7 shrink-0 !rounded border border-gold/40" fallbackText="text-xs" />
        <span className="font-display font-bold tracking-wide text-gold-light">{currentName}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={cn("ml-1 h-4 w-4 text-slate-hud transition-transform duration-300", open && "rotate-180")}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        role="listbox"
        aria-label={t("noHu.selectGame")}
        className={cn(
          "absolute left-0 top-full z-50 mt-2 flex w-72 origin-top-left flex-col gap-1.5 rounded-xl border border-neon/40 bg-panel/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl transition duration-200",
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
      >
        {games.status === "loading" && <p className="px-2.5 py-1 text-xs text-slate-hud">{t("noHu.loadingGames")}</p>}
        {items.map((g) => {
          const active = g.id === currentId;
          return (
            <Link
              key={g.id}
              href={`/no-hu/${g.id}`}
              role="option"
              aria-selected={active}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 transition-all",
                active ? "border-neon/40 bg-neon/20 shadow-neon-sm" : "border-transparent hover:border-neon/30 hover:bg-white/5",
              )}
            >
              <span className="flex items-center gap-3">
                <SlugImage kind="categories" name={g.name} className={cn("h-8 w-8 shrink-0 !rounded-lg border", active ? "border-gold/50" : "border-wire")} fallbackText="text-xs" />
                <span className={cn("font-display text-xs leading-tight", active ? "font-bold text-gold-light" : "font-semibold text-gray-200")}>{g.name}</span>
              </span>
              {active && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-ai-soft" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
