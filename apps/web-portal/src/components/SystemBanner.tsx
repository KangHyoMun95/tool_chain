"use client";

import { useI18n } from "@/src/i18n/provider";
import { ZapIcon } from "./icons";

export function SystemBanner() {
  const { t } = useI18n();
  return (
    <div className="system-banner">
      <span className="system-banner-icon">
        <ZapIcon className="icon-sm" />
      </span>
      <span>{t("banner.realtime")}</span>
    </div>
  );
}
