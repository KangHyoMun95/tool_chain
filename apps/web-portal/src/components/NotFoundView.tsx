"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";

export function NotFoundView() {
  const { t } = useI18n();
  return (
    <div className="card card-glass not-found">
      <h2 className="page-title">{t("notFound.title")}</h2>
      <p className="hint">{t("notFound.description")}</p>
      <Link href="/" className="btn btn-amber">
        {t("notFound.action")}
      </Link>
    </div>
  );
}
