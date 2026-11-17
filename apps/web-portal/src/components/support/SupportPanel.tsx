"use client";

import { useI18n } from "@/src/i18n/provider";
import { LifeBuoyIcon } from "../icons";
import { HudCard } from "../ui/HudCard";
import { TelegramButton } from "./TelegramButton";

const FAQ = ["1", "2", "3"] as const;

/** Phương án 3: nội dung trang /support (tiêu đề, mô tả, nút Telegram nổi bật, câu hỏi thường gặp trong i18n). */
export function SupportPanel({ url }: { url: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3.5">
      <HudCard className="flex flex-col items-center gap-4 px-5 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-neon/60 bg-neon/10 text-neon shadow-neon-md">
          <LifeBuoyIcon className="h-7 w-7" />
        </span>
        <h1 className="font-display text-2xl font-black uppercase tracking-wider text-white neon-text-glow">{t("support.title")}</h1>
        <p className="max-w-md text-sm leading-relaxed text-gray-400">{t("support.pageIntro")}</p>
        <TelegramButton url={url} className="px-8 py-3 text-base" />
      </HudCard>
      <HudCard className="p-4 sm:p-5">
        <h2 className="mb-3 font-display text-sm font-black uppercase tracking-widest text-gray-200">{t("support.faqTitle")}</h2>
        <dl className="flex flex-col gap-3">
          {FAQ.map((n) => (
            <div key={n} className="rounded-xl border border-gray-800/80 bg-[#15151e] p-3">
              <dt className="text-sm font-semibold text-gray-100">{t(`support.faq.q${n}`)}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-gray-400 sm:text-sm">{t(`support.faq.a${n}`)}</dd>
            </div>
          ))}
        </dl>
      </HudCard>
    </div>
  );
}
