"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/src/i18n/provider";

const pad = (n: number) => String(n).padStart(2, "0");
const format = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** Badge đếm ngược tới dòng lucky time kế tiếp (theo Stitch). Hết giờ ⇒ gọi `onElapsed` một lần (trang lấy lại dòng hiện tại). */
export function NextRoundCountdown({ nextAt, onElapsed }: { nextAt: number; onElapsed: () => void }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(() => Math.max(0, nextAt - Date.now()));
  const cb = useRef(onElapsed);
  cb.current = onElapsed;

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const ms = Math.max(0, nextAt - Date.now());
      setLeft(ms);
      if (ms <= 0 && !fired) { fired = true; cb.current(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextAt]);

  return (
    <div className="flex select-none items-center gap-2 rounded-xl border border-gold/40 bg-module px-3 py-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]" role="timer">
      <span className="relative flex h-2 w-2 items-center justify-center">
        <span className="absolute h-2 w-2 animate-ping rounded-full bg-gold-light" />
        <span className="h-2 w-2 rounded-full bg-gold-light shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
      </span>
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-hud">{t("noHu.nextRound")}</span>
      <span className="font-mono text-xs font-extrabold tracking-wider text-gold-light md:text-sm" style={{ textShadow: "0 0 10px rgba(255,200,50,0.7)" }}>{format(left)}</span>
    </div>
  );
}
