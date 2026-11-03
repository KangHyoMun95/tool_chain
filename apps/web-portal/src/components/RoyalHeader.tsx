"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import { BackButton, type BackLink } from "./BackButton";
import { BalanceBadge } from "./BalanceBadge";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { CrownIcon } from "./icons";

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
        {back && <BackButton back={back} />}
        <BalanceBadge />
        <LanguageSwitcher />
      </div>
    </header>
  );
}
