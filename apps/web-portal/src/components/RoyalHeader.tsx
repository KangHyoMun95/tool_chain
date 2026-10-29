"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import type { MessageKey } from "@/src/i18n/config";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ArrowLeftIcon, CrownIcon } from "./icons";

export type BackLink = { href: string; labelKey: MessageKey };

export function RoyalHeader({ back }: { back?: BackLink }) {
  const { t } = useI18n();

  return (
    <header className="royal-header">
      <Link href="/" className="brand">
        <span className="brand-logo">
          <CrownIcon className="icon-lg" />
        </span>
        <span>
          <span className="brand-name">{t("brand.name")}</span>
          <span className="brand-tagline">{t("brand.tagline")}</span>
        </span>
      </Link>
      <div className="header-actions">
        {back && (
          <Link href={back.href} className="btn btn-amber">
            <ArrowLeftIcon className="icon-sm" />
            {t(back.labelKey)}
          </Link>
        )}
        <LanguageSwitcher />
      </div>
    </header>
  );
}
