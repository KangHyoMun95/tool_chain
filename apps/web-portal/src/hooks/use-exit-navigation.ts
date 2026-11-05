"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "./use-reduced-motion";

export const EXIT_MS = 600;   // thời gian hiệu ứng thoát trước khi chuyển trang

/**
 * Bấm thẻ ⇒ `leaving = true` (các khối áp class thoát), sau EXIT_MS mới chuyển trang.
 * Bật "giảm chuyển động" ⇒ chuyển ngay. Bấm lại khi đang thoát bị bỏ qua; rời trang thì hủy timer.
 */
export function useExitNavigation() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const go = useCallback((href: string) => {
    if (leaving) return;
    if (reduced) { router.push(href); return; }
    setLeaving(true);
    timer.current = setTimeout(() => router.push(href), EXIT_MS);
  }, [leaving, reduced, router]);

  return { leaving, go };
}
