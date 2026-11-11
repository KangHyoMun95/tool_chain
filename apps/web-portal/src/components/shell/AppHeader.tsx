"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useI18n } from "@/src/i18n/provider";
import { formatBalance, getMe } from "@/src/lib/api/me";
import { GlobeIcon, LogOutIcon, MenuIcon, UserIcon, WalletIcon } from "../icons";
import { LanguageDialog } from "./LanguageDialog";
import { LogoutDialog } from "./LogoutDialog";
import { MenuDrawer, MenuDrawerItem } from "./MenuDrawer";

const ME_REFRESH_MS = 15_000;

/** Header chung: logo, lời chào (số điện thoại; ẩn ở màn hình nhỏ), số dư (luôn hiện), menu hamburger (drawer: chọn ngôn ngữ, đăng xuất). Mục drawer mở dialog chọn ngôn ngữ / xác nhận đăng xuất. */
export function AppHeader() {
  const { t } = useI18n();
  const me = useApi(getMe, [], { refreshMs: ME_REFRESH_MS });
  const ready = me.status === "success";
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"language" | "logout" | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const openDialog = (d: "language" | "logout") => { setMenuOpen(false); setDialog(d); };

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
        <div className="hidden items-center gap-2 rounded-full border border-red-900/60 bg-[#121218] px-3 py-1.5 shadow-inner sm:flex">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-red-600 to-rose-400 text-white shadow-neon-sm">
            <UserIcon className="h-3.5 w-3.5" />
          </span>
          <span className="text-left text-xs leading-tight">
            <span className="block text-[10px] text-gray-400">{t("shell.greeting")}</span>
            <span className="block max-w-[9rem] truncate font-bold text-gray-100">{ready ? me.data.phone : "—"}</span>
          </span>
        </div>

        <div className="flex flex-col px-1 text-right sm:px-2">
          <span className="text-[10px] text-gray-400">{t("shell.balance")}</span>
          <span className="flex items-center justify-end gap-1 font-mono text-sm font-extrabold text-gold-light drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
            <WalletIcon className="h-3.5 w-3.5 text-neon" />
            {ready ? formatBalance(me.data.balance) : "—"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("shell.menu")}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="btn-fx-soft rounded-lg border border-red-900/40 bg-[#14141c] p-2 text-gray-300 hover:text-white"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      <MenuDrawer open={menuOpen} onClose={closeMenu} title={t("shell.menu")}>
        <MenuDrawerItem icon={<GlobeIcon className="h-4 w-4" />} label={t("shell.menuLanguage")} onClick={() => openDialog("language")} />
        <MenuDrawerItem icon={<LogOutIcon className="h-4 w-4" />} label={t("shell.menuLogout")} onClick={() => openDialog("logout")} />
      </MenuDrawer>

      <LanguageDialog open={dialog === "language"} onClose={closeDialog} />
      <LogoutDialog open={dialog === "logout"} onClose={closeDialog} />
    </header>
  );
}
