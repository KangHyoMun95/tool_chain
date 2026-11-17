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
          className="btn-fx-soft inline-flex h-11 w-11 items-center justify-center rounded-full border border-neon/40 bg-neon/5 text-zinc-300 hover:border-neon hover:text-neon focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-soft"
        >
          <TelegramIcon className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
