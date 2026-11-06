"use client";

import { useEffect } from "react";

/**
 * Ripple tại điểm bấm cho mọi phần tử `.btn-fx`. Gắn một listener ở document (event delegation) nên các nút không cần
 * mã riêng; ripple tự gỡ khi chạy xong. `prefers-reduced-motion` tắt animation nên ripple bị gỡ ngay.
 */
export function ButtonEffects() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(".btn-fx");
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const wave = document.createElement("span");
      wave.className = "fx-ripple";
      wave.style.width = wave.style.height = `${size}px`;
      wave.style.left = `${e.clientX - rect.left - size / 2}px`;
      wave.style.top = `${e.clientY - rect.top - size / 2}px`;
      el.appendChild(wave);
      const remove = () => wave.remove();
      wave.addEventListener("animationend", remove, { once: true });
      setTimeout(remove, 800);   // dự phòng khi animation bị tắt
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
