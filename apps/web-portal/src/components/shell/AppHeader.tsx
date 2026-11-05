"use client";

import Link from "next/link";
import { useApi } from "@/src/hooks/use-api";
import { useComingSoon } from "@/src/hooks/use-coming-soon";
import { useI18n } from "@/src/i18n/provider";
import { formatBalance, getMe } from "@/src/lib/api/me";
import { BellIcon, MenuIcon, UserIcon, WalletIcon } from "../icons";
import { NeonButton } from "../ui/NeonButton";

const ME_REFRESH_MS = 15_000;

/** Header chung: logo, lời chào (số điện thoại), số dư, NẠP TIỀN, chuông, menu. Các nút chưa có chức năng báo "Coming soon". */
export function AppHeader() {
  const { t } = useI18n();
  const comingSoon = useComingSoon();
  const me = useApi(getMe, [], { refreshMs: ME_REFRESH_MS });
  const ready = me.status === "success";

  return (
    <header className="neon-border relative z-20 flex items-center justify-between rounded-2xl bg-panel px-3 py-2 sm:px-5 sm:py-2.5">
      <Link href="/" className="relative z-30 -my-5 -ml-1 transition-transform hover:scale-105 sm:-ml-2" aria-label={t("brand.name")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo.png"
          alt={t("brand.name")}
          className="h-20 w-auto object-contain drop-shadow-[0_0_20px_rgba(255,23,68,0.95)] drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] sm:h-24 md:h-28"
          style={{ maxHeight: 110 }}
        />
      </Link>

      <div className="flex items-center gap-2 sm:gap-3.5">
        <div className="flex items-center gap-2 rounded-full border border-red-900/60 bg-[#121218] px-3 py-1.5 shadow-inner">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-red-600 to-rose-400 text-white shadow-neon-sm">
            <UserIcon className="h-3.5 w-3.5" />
          </span>
          <span className="text-left text-xs leading-tight">
            <span className="block text-[10px] text-gray-400">{t("shell.greeting")}</span>
            <span className="block max-w-[9rem] truncate font-bold text-gray-100">{ready ? me.data.phone : "—"}</span>
          </span>
        </div>

        <div className="hidden flex-col px-2 text-right sm:flex">
          <span className="text-[10px] text-gray-400">{t("shell.balance")}</span>
          <span className="flex items-center justify-end gap-1 font-mono text-sm font-extrabold text-gold-light drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
            <WalletIcon className="h-3.5 w-3.5 text-neon" />
            {ready ? formatBalance(me.data.balance) : "—"}
          </span>
        </div>

        <NeonButton className="px-3.5 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm" onClick={comingSoon}>
          {t("shell.deposit")}
        </NeonButton>

        <button
          type="button"
          onClick={comingSoon}
          aria-label={t("shell.notifications")}
          className="relative rounded-full border border-red-900/40 bg-[#14141c] p-2 text-gray-300 transition-all hover:bg-red-950/50 hover:text-white"
        >
          <BellIcon className="h-4 w-4 text-rose-500" />
          <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-neon shadow-neon-sm" />
        </button>

        <button
          type="button"
          onClick={comingSoon}
          aria-label={t("shell.menu")}
          className="rounded-lg border border-red-900/40 bg-[#14141c] p-2 text-gray-300 hover:text-white"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
