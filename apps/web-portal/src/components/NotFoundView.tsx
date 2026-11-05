"use client";

import { useI18n } from "@/src/i18n/provider";
import { HudCard } from "./ui/HudCard";
import { NeonLink } from "./ui/NeonButton";

export function NotFoundView() {
  const { t } = useI18n();
  return (
    <HudCard panel className="flex flex-col items-start gap-3 p-6">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">{t("notFound.title")}</h2>
      <p className="text-sm text-gray-300">{t("notFound.description")}</p>
      <NeonLink href="/" className="px-5 py-2 text-sm">{t("notFound.action")}</NeonLink>
    </HudCard>
  );
}
