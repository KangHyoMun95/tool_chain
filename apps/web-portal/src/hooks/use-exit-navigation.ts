"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "./use-reduced-motion";

export const EXIT_MS = 600;   // thời gian hiệu ứng thoát trước khi chuyển trang

/**
 * Bấm thẻ ⇒ `leaving` (nội dung trang: banner, thẻ) = true, sau EXIT_MS mới chuyển trang. `go(href, true)` thêm `leavingMenu`
 * (menu rút đi) — dùng khi trang đích không có sidebar. Bật "giảm chuyển động" ⇒ chuyển ngay. Bấm lại khi đang thoát bị bỏ qua;
 * shell dùng chung nhiều trang nên trạng thái thoát được xóa khi đường dẫn đổi.
 */
export function useExitNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [exit, setExit] = useState({ content: false, menu: false });
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setExit({ content: false, menu: false }), [pathname]);

  const go = useCallback((href: string, menu = false) => {
    if (exit.content) return;
    if (reduced) { router.push(href); return; }
    setExit({ content: true, menu });
    timer.current = setTimeout(() => router.push(href), EXIT_MS);
  }, [exit.content, reduced, router]);

  return { leaving: exit.content, leavingMenu: exit.menu, go };
}
