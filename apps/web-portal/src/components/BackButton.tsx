"use client";

import Link from "next/link";
import { useI18n } from "@/src/i18n/provider";
import type { MessageKey } from "@/src/i18n/config";
import { ArrowLeftIcon } from "./icons";

export type BackLink = { href: string; labelKey: MessageKey };

export function BackButton({ back }: { back: BackLink }) {
  const { t } = useI18n();
  return (
    <Link href={back.href} className="btn btn-amber">
      <ArrowLeftIcon className="icon-sm" />
      {t(back.labelKey)}
    </Link>
  );
}
