"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApi } from "@/src/hooks/use-api";
import { useComingSoon } from "@/src/hooks/use-coming-soon";
import { useI18n } from "@/src/i18n/provider";
import { listLobbies } from "@/src/lib/api/catalog";
import { cn } from "@/src/lib/cn";
import { stagger } from "@/src/lib/stagger";
import { BarChartIcon, HomeIcon, LifeBuoyIcon, NewspaperIcon, StarIcon } from "../icons";
import { SlugImage } from "../ui/SlugImage";
import { EXIT_ITEM, useShellExit } from "./ShellExit";

const ITEM = "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm";
const ACTIVE = "border-transparent [&_svg]:text-white bg-gradient-to-r from-red-600 to-rose-700 font-bold text-white shadow-neon-sm";
const IDLE = "border-transparent font-medium text-gray-300 hover:border-red-900/50 hover:bg-red-950/40 hover:text-white";

/** Menu dọc: Trang chủ, các lobby ACTIVE từ API, và các mục chưa có chức năng (alert "Coming soon"). */
export function Sidebar({ activeLobbyId }: { activeLobbyId?: string }) {
  const { t } = useI18n();
  const comingSoon = useComingSoon();
  const { leaving, go } = useShellExit();
  const lobbies = useApi(listLobbies, []);

  const items: Array<{ key: string; icon: ReactNode; label: string; active: boolean; href?: string }> = [
    { key: "home", icon: <HomeIcon className="h-5 w-5 shrink-0 text-neon" />, label: t("sidebar.home"), active: activeLobbyId === undefined, href: "/" },
    ...(lobbies.status === "success" ? lobbies.data : []).map((l) => ({
      key: `lobby-${l.id}`,
      icon: <SlugImage kind="lobbies" name={l.name} className="h-5 w-5 shrink-0 rounded-md" fallbackText="text-xs" />,
      label: l.name,
      active: l.id === activeLobbyId,
      href: `/lobbies/${l.id}`,
    })),
    { key: "stats", icon: <BarChartIcon className="h-5 w-5 shrink-0 text-red-400" />, label: t("sidebar.stats"), active: false },
    { key: "vip", icon: <StarIcon className="h-5 w-5 shrink-0 text-gold-light" />, label: t("sidebar.vip"), active: false },
    { key: "news", icon: <NewspaperIcon className="h-5 w-5 shrink-0 text-red-400" />, label: t("sidebar.news"), active: false },
    { key: "support", icon: <LifeBuoyIcon className="h-5 w-5 shrink-0 text-rose-500" />, label: t("sidebar.support"), active: false },
  ];

  // Thoát: rút lên theo thứ tự ngược (cuối → đầu)
  return (
    <aside className="neon-panel w-full shrink-0 overflow-x-auto p-3 lg:w-48 lg:overflow-x-visible xl:w-56" aria-label={t("sidebar.label")}>
      <nav className="flex gap-1.5 lg:flex-col">
        {items.map((item, i) => {
          const cls = cn(ITEM, item.active ? ACTIVE : IDLE, "whitespace-nowrap transition-colors");
          const motion = leaving
            ? { className: EXIT_ITEM, style: { transitionDelay: `${(items.length - 1 - i) * 45}ms` } }
            : { className: "animate-slide-in-left", style: stagger(i, 60, 60) };
          const body = (
            <>
              {item.icon}
              <span>{item.label}</span>
            </>
          );
          return item.href ? (
            <Link
              key={item.key}
              href={item.href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                go(item.href!);
              }}
              aria-current={item.active ? "page" : undefined}
              className={cn(cls, motion.className)}
              style={motion.style}
            >
              {body}
            </Link>
          ) : (
            <button key={item.key} type="button" onClick={comingSoon} className={cn(cls, "text-left", motion.className)} style={motion.style}>
              {body}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
