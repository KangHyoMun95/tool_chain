"use client";

import type { MessageKey } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { BackLink } from "../ui/BackLink";
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
      <BackLink
        href={backHref}
        label={t(backLabel)}
        badge={<span className="relative z-10 rounded-full border border-red-400/40 bg-red-950/80 px-2 py-0.5 text-[10px] font-black tracking-wider shadow-[0_0_8px_rgba(255,0,0,0.6)]">LIVE</span>}
      />
    </HudCard>
  );
}
