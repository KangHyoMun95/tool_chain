"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/src/lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** false: không đóng được bằng Esc / nhấn nền (đang xử lý). */
  dismissible?: boolean;
  className?: string;
};

/** Dialog giữa màn hình: nền `bg-panel` + viền neon như header, lớp phủ tối, Esc / nhấn nền để đóng, focus trả về nơi mở. */
export function Modal({ open, onClose, title, children, dismissible = true, className }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // Giữ bản mới nhất trong ref để effect chỉ chạy lại khi mở / đóng (không cướp lại focus khi `dismissible` đổi).
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && latest.current.dismissible) latest.current.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={dismissible ? onClose : undefined} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn("neon-border relative w-full max-w-sm animate-fade-in rounded-2xl bg-panel p-5 shadow-neon-md outline-none", className)}
      >
        <h2 className="mb-3 font-display text-base font-black uppercase tracking-widest text-gray-100">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
