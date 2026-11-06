"use client";

import { useComingSoon } from "@/src/hooks/use-coming-soon";
import { useI18n } from "@/src/i18n/provider";
import { MegaphoneIcon } from "../icons";

/** Dải thông báo cuối trang (nội dung tĩnh; "Xem chi tiết" chưa có chức năng). */
export function NoticeTicker() {
  const { t } = useI18n();
  const comingSoon = useComingSoon();

  return (
    <section className="neon-panel mt-auto flex items-center justify-between gap-3 bg-[#0a0a0f] px-4 py-2.5 font-mono">
      <div className="flex flex-1 items-center gap-3 overflow-hidden">
        <span className="cyber-btn-red flex shrink-0 animate-notify-shake items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black tracking-wider text-white">
          <MegaphoneIcon className="h-4 w-4" />
          {t("notice.label")}
        </span>
        <p className="truncate text-xs font-semibold text-gray-200 sm:text-sm">
          {t("notice.before")} <span className="font-bold text-red-400">{t("brand.name")}</span> {t("notice.after")}
        </p>
      </div>
      <button type="button" onClick={comingSoon} className="btn-fx cyber-btn-red flex shrink-0 items-center gap-1 rounded-full px-4 py-1.5 text-xs font-bold text-white">
        <span className="relative z-10">{t("notice.more")}</span> <span className="fx-arrow-right relative z-10 text-sm leading-none">→</span>
      </button>
    </section>
  );
}
