"use client";

import Link from "next/link";
import { cn } from "@/src/lib/cn";
import { stagger } from "@/src/lib/stagger";
import { ChevronRightIcon } from "../icons";
import { EXIT_CARD, useShellExit } from "../shell/ShellExit";
import { SlugImage } from "../ui/SlugImage";

type Props = {
  kind: "lobbies" | "categories";
  name: string;
  subtitle: string;
  href: string;
  index: number;
  total: number;
  /** Thẻ vừa được bấm (hiệu ứng nhấn trước khi thoát). */
  clicked: boolean;
  onClick: () => void;
};

/** Thẻ lobby (trang chủ) / category (trang lobby): ảnh theo slug tên, tên IN HOA, dòng phụ là số liệu thật. */
export function CatalogCard({ kind, name, subtitle, href, index, total, clicked, onClick }: Props) {
  const { leaving, go } = useShellExit();

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick();
        go(href, kind === "categories");   // trang danh sách bàn không có sidebar ⇒ menu rút đi
      }}
      className={cn(
        "neon-panel group flex items-center justify-between bg-[#0e0e13] p-3.5 transition-all hover:border-red-400 hover:shadow-neon-md",
        leaving ? EXIT_CARD : "animate-slide-in-right",
        clicked && "scale-[0.96] !border-[#ff0055] shadow-[0_0_35px_rgba(255,23,68,1),inset_0_0_20px_rgba(255,23,68,0.8)]",
      )}
      style={leaving ? { transitionDelay: `${(total - 1 - index) * 70}ms` } : stagger(index, 80, 150)}
    >
      <span className="flex min-w-0 items-center gap-3">
        <SlugImage kind={kind} name={name} className="h-14 w-14 shrink-0 transition-transform group-hover:scale-105" />
        <span className="min-w-0">
          <span className="block truncate font-display text-base font-extrabold uppercase tracking-wide text-white transition-colors group-hover:text-red-400">{name}</span>
          <span className="mt-0.5 block text-xs text-gray-400">{subtitle}</span>
        </span>
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-neon-sm transition-transform group-hover:translate-x-1">
        <ChevronRightIcon className="h-3 w-3" />
      </span>
    </Link>
  );
}
