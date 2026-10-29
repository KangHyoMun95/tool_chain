"use client";

import { LOCALES, LOCALE_LABELS, isLocale } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { GlobeIcon } from "./icons";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="lang-switch">
      <GlobeIcon className="icon-sm" />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
