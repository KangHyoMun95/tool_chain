"use client";

import { createContext, useContext } from "react";

/** Trạng thái "đang thoát trang" dùng chung cho sidebar, hero, thẻ: bấm thẻ ⇒ leaving = true rồi mới chuyển trang. */
export type ShellExit = {
  leaving: boolean;        // nội dung trang đang thoát (banner, thẻ)
  leavingMenu: boolean;    // menu sidebar đang rút đi (chỉ khi trang đích không có sidebar)
  go: (href: string, menu?: boolean) => void;
};

export const ShellExitContext = createContext<ShellExit>({ leaving: false, leavingMenu: false, go: () => undefined });
export const useShellExit = (): ShellExit => useContext(ShellExitContext);

// Lớp thoát (keyframe trong tailwind.config.ts). Độ trễ so le đặt qua `animationDelay`.
export const EXIT_ITEM = "animate-exit-menu pointer-events-none";   // menu: rút đi từ phải qua trái
export const EXIT_CARD = "animate-exit-card pointer-events-none";   // thẻ: trượt từ trái sang phải
export const EXIT_HERO = "animate-exit-hero pointer-events-none";   // banner: trượt lên và mờ dần
