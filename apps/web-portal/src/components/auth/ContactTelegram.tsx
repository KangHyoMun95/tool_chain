"use client";

import { useI18n } from "@/src/i18n/provider";
import { TelegramIcon } from "../icons";

/** Dòng "—— OR ——" + icon Telegram (mở tab mới). `url` rỗng ⇒ không render gì (không để lại khoảng trống). */
export function ContactTelegram({ url }: { url: string | null }) {
  const { t } = useI18n();
  if (!url) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-zinc-700/70" />
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">{t("auth.or")}</span>
        <span className="h-px flex-1 bg-zinc-700/70" />
      </div>
      <div className="mt-3 flex justify-center">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Telegram"
          className="btn-fx-soft inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-[0_0_12px_rgba(42,171,238,0.5)] hover:!bg-[#37b6f5] hover:!shadow-[0_0_18px_rgba(42,171,238,0.8)] focus-visible:ring-2 focus-visible:ring-[#8fd8f7]"
        >
          <TelegramIcon className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
