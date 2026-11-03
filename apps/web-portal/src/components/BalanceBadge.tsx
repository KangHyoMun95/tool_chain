"use client";

import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { formatBalance, getBalance } from "@/src/lib/api/me";
import { PlusIcon, WalletIcon } from "./icons";

const BALANCE_REFRESH_MS = 15_000;

export function BalanceBadge() {
  const { t } = useI18n();
  const balance = useApi(getBalance, [], { refreshMs: BALANCE_REFRESH_MS });

  return (
    <div className="balance">
      <span className="balance-icon"><WalletIcon className="icon-sm" /></span>
      <div>
        <p className="balance-label">{t("balance.label")}</p>
        <p className="balance-value">{balance.status === "success" ? formatBalance(balance.data) : "—"}</p>
      </div>
      {/* Chưa có luồng nạp điểm (phase sau): nút chỉ để giữ bố cục. */}
      <button type="button" className="balance-topup" disabled title={t("balance.topupSoon")}>
        <PlusIcon className="icon-xs" /> {t("balance.topup")}
      </button>
    </div>
  );
}
