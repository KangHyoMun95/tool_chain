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
  const [exit, setExit] = useState({ content: false, menu: false, from: "" });
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);
  // Trạng thái thoát chỉ có hiệu lực ở trang đã bấm: khi đường dẫn đổi, trang mới mount với `leaving = false` ngay trong cùng
  // lượt render (nếu đợi effect xóa thì banner/thẻ của trang mới bị áp lớp thoát một khung hình rồi mới chạy hiệu ứng vào ⇒ giật).
  const active = exit.from === pathname;
  useEffect(() => { if (exit.from && exit.from !== pathname) setExit({ content: false, menu: false, from: "" }); }, [exit.from, pathname]);

  const go = useCallback((href: string, menu = false) => {
    if (exit.content && active) return;
    if (reduced) { router.push(href); return; }
    setExit({ content: true, menu, from: pathname });
    timer.current = setTimeout(() => router.push(href), EXIT_MS);
  }, [exit.content, active, pathname, reduced, router]);

  return { leaving: exit.content && active, leavingMenu: exit.menu && active, go };
}
