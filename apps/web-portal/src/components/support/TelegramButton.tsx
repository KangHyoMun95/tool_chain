"use client";

import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { TelegramIcon } from "../icons";

/** Nút "Chat qua Telegram" dùng chung cho mọi bề mặt CSKH. Mở tab mới. */
export function TelegramButton({ url, className }: { url: string; className?: string }) {
  const { t } = useI18n();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Telegram"
      className={cn(
        "btn-fx cyber-btn-red inline-flex select-none items-center justify-center gap-2 rounded-full border border-neon-soft px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-soft",
        className,
      )}
    >
      <TelegramIcon className="h-5 w-5" />
      <span className="relative z-10">{t("support.telegramCta")}</span>
    </a>
  );
}
