"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
const SKELETON_ROWS = 7;

/** Khung chờ trong lúc gọi API lấy danh sách lobby. */
function SidebarSkeleton({ label }: { label: string }) {
  return (
    <div className="flex gap-1.5 lg:flex-col" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="flex min-w-[8.5rem] animate-pulse items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 lg:min-w-0">
          <span className="h-5 w-5 shrink-0 rounded-md bg-neon/35" />
          <span className="h-3 flex-1 rounded bg-white/20" style={{ maxWidth: `${55 + ((i * 17) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Menu dọc: Trang chủ, các lobby ACTIVE từ API, và các mục chưa có chức năng (alert "Coming soon").
 * - Trong lúc gọi API: khung chờ (skeleton). Có dữ liệu: các mục trượt vào từ phải sang trái, lần lượt từ trên xuống.
 * - Bấm "Trang chủ" / mục lobby: chuyển trang ngay, menu không có hiệu ứng (shell dùng chung nên menu đứng yên).
 * - Bấm thẻ category (sang trang không có sidebar): menu rút đi từ phải qua trái, lần lượt từ dưới lên.
 */
export function Sidebar() {
  const { t } = useI18n();
  const comingSoon = useComingSoon();
  const { leavingMenu } = useShellExit();
  const pathname = usePathname();
  const lobbies = useApi(listLobbies, []);

  const activeLobbyId = /^\/lobbies\/([^/]+)/.exec(pathname)?.[1];
  const isHome = pathname === "/";

  const items: Array<{ key: string; icon: ReactNode; label: string; active: boolean; href?: string }> = [
    { key: "home", icon: <HomeIcon className="h-5 w-5 shrink-0 text-neon" />, label: t("sidebar.home"), active: isHome, href: "/" },
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

  return (
    <aside className="neon-panel w-full shrink-0 overflow-x-auto p-3 lg:w-48 lg:overflow-x-visible xl:w-56" aria-label={t("sidebar.label")}>
      {lobbies.status === "loading" ? (
        <SidebarSkeleton label={t("common.loading")} />
      ) : (
        <nav className="flex gap-1.5 lg:flex-col">
          {items.map((item, i) => {
            const cls = cn(ITEM, item.active ? ACTIVE : IDLE, "whitespace-nowrap transition-colors");
            // Thoát: rút đi theo thứ tự ngược (cuối → đầu)
            const motion = leavingMenu
              ? { className: EXIT_ITEM, style: { animationDelay: `${(items.length - 1 - i) * 30}ms` } }
              : { className: "animate-slide-in-left", style: stagger(i, 60, 60) };
            const body = (
              <>
                {item.icon}
                <span>{item.label}</span>
              </>
            );
            return item.href ? (
              <Link key={item.key} href={item.href} aria-current={item.active ? "page" : undefined} className={cn(cls, motion.className)} style={motion.style}>
                {body}
              </Link>
            ) : (
              <button key={item.key} type="button" onClick={comingSoon} className={cn(cls, "text-left", motion.className)} style={motion.style}>
                {body}
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
