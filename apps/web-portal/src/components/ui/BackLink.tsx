"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "../icons";

/** Nút "Quay Lại ..." chuẩn của portal (đỏ, mũi tên nhích khi hover). `badge` là nhãn nhỏ bên phải (vd LIVE). */
export function BackLink({ href, label, badge }: { href: string; label: string; badge?: ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-fx group flex select-none items-center gap-2 rounded-full border border-red-400 bg-gradient-to-r from-red-700 via-red-600 to-red-800 px-4 py-1.5 text-xs font-bold text-white shadow-[0_0_14px_rgba(255,26,64,0.6)] sm:px-5 sm:py-2 sm:text-sm"
    >
      <ArrowLeftIcon className="fx-arrow-left h-3.5 w-3.5" />
      <span className="relative z-10">{label}</span>
      {badge}
    </Link>
  );
}
