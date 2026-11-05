"use client";

import { createContext, useContext } from "react";

/** Trạng thái "đang thoát trang" dùng chung cho sidebar, hero, thẻ: bấm thẻ ⇒ leaving = true rồi mới chuyển trang. */
export type ShellExit = { leaving: boolean; go: (href: string) => void };

export const ShellExitContext = createContext<ShellExit>({ leaving: false, go: () => undefined });
export const useShellExit = (): ShellExit => useContext(ShellExitContext);

// Lớp thoát (cố định chuỗi để Tailwind sinh CSS). Thời gian/độ trễ đặt qua style.
export const EXIT_ITEM = "-translate-x-[60px] opacity-0 pointer-events-none transition-all duration-500 ease-in-out";
export const EXIT_CARD = "translate-x-20 opacity-0 pointer-events-none transition-all duration-500 ease-in-out";
export const EXIT_HERO = "-translate-y-[50px] opacity-0 pointer-events-none transition-all duration-[600ms] ease-in-out";
