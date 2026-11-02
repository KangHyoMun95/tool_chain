"use client";

import { useI18n } from "@/src/i18n/provider";
import type { ApiError } from "@/src/lib/api/client";

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="data-state" role="status">
      <span className="auth-spinner auth-spinner-lg" aria-hidden="true" />
      <p className="hint">{t("common.loading")}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card card-glass data-state" role="alert">
      <p className="hint">{t(error.status === 0 ? "common.errorNetwork" : "common.error")}</p>
      <button type="button" className="btn btn-amber btn-sm" onClick={onRetry}>
        {t("common.retry")}
      </button>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card card-glass data-state">
      <p className="hint">{message}</p>
    </div>
  );
}
