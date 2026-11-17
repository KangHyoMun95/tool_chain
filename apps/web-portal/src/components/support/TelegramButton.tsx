"use client";

import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { TelegramIcon } from "../icons";

/** Nút "Chat qua Telegram" dùng chung cho mọi bề mặt CSKH. Mở tab mới. Màu xanh thương hiệu Telegram (#37AEE2 → #1E96C8); hover ghi đè bloom đỏ của .btn-fx. */
export function TelegramButton({ url, className }: { url: string; className?: string }) {
  const { t } = useI18n();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Telegram"
      className={cn(
        "btn-fx inline-flex select-none items-center justify-center gap-2 rounded-full bg-[#2AABEE] text-white px-4 py-2 font-display text-xs font-bold uppercase tracking-wider shadow-[0_0_14px_rgba(42,171,238,0.55)] hover:!bg-[#37b6f5] hover:!shadow-[0_0_20px_rgba(42,171,238,0.8),0_0_35px_rgba(42,171,238,0.45)] focus-visible:ring-2 focus-visible:ring-[#8fd8f7]",
        className,
      )}
    >
      <TelegramIcon className="h-4 w-4" />
      <span className="relative z-10">{t("support.telegramCta")}</span>
    </a>
  );
}
