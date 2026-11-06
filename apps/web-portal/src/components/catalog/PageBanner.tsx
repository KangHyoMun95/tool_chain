"use client";

import Link from "next/link";
import type { MessageKey } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { ArrowLeftIcon } from "../icons";
import { HudCard } from "../ui/HudCard";
import { StatusBadge, type ConnectionState } from "../ui/StatusBadge";

/** Banner đầu trang danh sách bàn / chi tiết bàn: trạng thái + tên (trái), nút "Quay Lại Sảnh" (phải). */
export function PageBanner({ title, backHref, state = "live", backLabel = "nav.backToLobbies" }: { title: string; backHref: string; state?: ConnectionState; backLabel?: MessageKey }) {
  const { t } = useI18n();
  return (
    <HudCard className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <StatusBadge state={state} />
        <h1 className="font-display text-xl font-black uppercase leading-none tracking-wider text-white md:text-2xl">{title}</h1>
      </div>
      <Link
        href={backHref}
        className="btn-fx group flex select-none items-center gap-2 rounded-full border border-red-400 bg-gradient-to-r from-red-700 via-red-600 to-red-800 px-4 py-1.5 text-xs font-bold text-white shadow-[0_0_14px_rgba(255,26,64,0.6)] sm:px-5 sm:py-2 sm:text-sm"
      >
        <ArrowLeftIcon className="fx-arrow-left h-3.5 w-3.5" />
        <span className="relative z-10">{t(backLabel)}</span>
        <span className="relative z-10 rounded-full border border-red-400/40 bg-red-950/80 px-2 py-0.5 text-[10px] font-black tracking-wider shadow-[0_0_8px_rgba(255,0,0,0.6)]">LIVE</span>
      </Link>
    </HudCard>
  );
}
