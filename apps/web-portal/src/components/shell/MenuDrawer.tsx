"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { XIcon } from "../icons";

/** Phải khớp thời lượng animation drawer-out-* / fade-out trong tailwind.config.ts. */
const CLOSE_MS = 240;

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * Drawer của menu hamburger: từ `sm` trở lên trượt từ phải sang trái (bo 16px góc trên-trái và dưới-trái), màn hình nhỏ
 * hiện ở trên cùng và trượt từ trên xuống (bo 16px hai góc dưới). Viền + nền giống header. Render qua portal vào body
 * (header có z-index riêng nên `fixed` bên trong sẽ bị kẹt dưới nội dung).
 */
export function MenuDrawer({ open, onClose, title, children }: Props) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(open);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      setMounted(true);
      return;
    }
    const id = setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mounted, onClose]);

  useEffect(() => {
    if (open && mounted) closeBtn.current?.focus();
    if (!open && !mounted && opener.current instanceof HTMLElement) opener.current.focus();
  }, [open, mounted]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={cn("absolute inset-0 bg-black/60", open ? "animate-fade-in" : "animate-fade-out")}
        onClick={onClose}
      />
      <aside
        className={cn(
          "neon-border absolute bg-panel p-4 shadow-neon-md",
          // Màn hình nhỏ: ở trên, trượt từ trên xuống.
          "inset-x-0 top-0 rounded-b-2xl",
          open ? "animate-drawer-in-top" : "animate-drawer-out-top",
          // Từ sm: bên phải, cao hết màn hình, trượt từ phải sang trái.
          "sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:w-[320px] sm:rounded-none sm:rounded-l-2xl",
          open ? "sm:animate-drawer-in-right" : "sm:animate-drawer-out-right",
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-sm font-black uppercase tracking-widest text-gray-200">{title}</span>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label={t("shell.closeMenu")}
            className="btn-fx-soft rounded-lg border border-red-900/40 bg-[#14141c] p-2 text-gray-300 hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex flex-col gap-2">{children}</nav>
      </aside>
    </div>,
    document.body,
  );
}

/** Một mục của drawer. */
export function MenuDrawerItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-fx-soft flex w-full items-center gap-3 rounded-xl border border-red-900/40 bg-[#14141c] px-3.5 py-3 text-left text-sm font-semibold text-gray-100 hover:bg-red-950/50"
    >
      <span className="text-neon">{icon}</span>
      {label}
    </button>
  );
}
