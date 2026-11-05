"use client";

import { LOCALES, LOCALE_LABELS, isLocale } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { GlobeIcon } from "./icons";

/** Chọn ngôn ngữ. Hiện chưa gắn vào đâu (sẽ nằm trong menu hamburger khi có thiết kế); giữ lại để dùng sau. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-neon/40 bg-panel px-3 py-1.5 text-sm text-gray-200">
      <GlobeIcon className="h-4 w-4 text-neon" />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        className="cursor-pointer bg-transparent font-medium outline-none"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="bg-panel">
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
