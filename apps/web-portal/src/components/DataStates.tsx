"use client";

import { useI18n } from "@/src/i18n/provider";
import type { ApiError } from "@/src/lib/api/client";
import { HudCard } from "./ui/HudCard";
import { NeonButton } from "./ui/NeonButton";
import { Spinner } from "./ui/Spinner";

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center" role="status">
      <Spinner className="h-8 w-8 border-neon/30 border-t-neon" />
      <p className="font-mono text-xs uppercase tracking-widest text-slate-hud">{t("common.loading")}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <HudCard panel className="flex flex-col items-center gap-3 px-4 py-10 text-center" role="alert">
      <p className="text-sm text-red-200">{t(error.status === 0 ? "common.errorNetwork" : "common.error")}</p>
      <NeonButton className="px-5 py-2 text-sm" onClick={onRetry}>{t("common.retry")}</NeonButton>
    </HudCard>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <HudCard panel className="px-4 py-10 text-center">
      <p className="text-sm text-gray-300">{message}</p>
    </HudCard>
  );
}
