"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { CheckCircleIcon, CogIcon, ShieldCheckIcon, ZapIcon } from "../icons";
import { EXIT_HERO, useShellExit } from "../shell/ShellExit";

const BADGES = [
  { key: "hero.badgeAi", Icon: ZapIcon },
  { key: "hero.badgeAccurate", Icon: CheckCircleIcon },
  { key: "hero.badgeOptimize", Icon: CogIcon },
  { key: "hero.badgeSafe", Icon: ShieldCheckIcon },
] as const;

/** Banner thương hiệu của trang chủ và trang lobby. */
export function HeroBanner() {
  const { t } = useI18n();
  const { leaving } = useShellExit();
  // Chỉ chạy hiệu ứng vào khi ảnh nền đã giải mã xong, tránh giật vì vừa chạy hiệu ứng vừa giải mã ảnh lớn.
  const [ready, setReady] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el?.complete) void el.decode().then(() => setReady(true), () => setReady(true));
    const fallback = setTimeout(() => setReady(true), 400);   // ảnh lỗi/chậm thì vẫn hiện banner
    return () => clearTimeout(fallback);
  }, []);

  return (
    <section
      className={cn(
        "neon-panel relative flex min-h-[220px] items-center overflow-hidden px-6 py-6 will-change-[transform,opacity] sm:px-10 lg:min-h-[260px]",
        leaving ? EXIT_HERO : ready ? "animate-banner-in" : "opacity-0",
      )}
    >
      {/* Từ md: GIF chỉ phủ 72% bên phải (mép trái mờ dần vào nền) để điểm hội tụ của vệt sáng dời sang phải (~80%) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-full md:w-[72%] md:[mask-image:linear-gradient(to_right,transparent,#000_30%)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={img}
          src="/images/banner_trang_chu.gif"
          alt=""
          decoding="async"
          onLoad={(e) => void e.currentTarget.decode().then(() => setReady(true), () => setReady(true))}
          // Tăng sáng/tương phản nhẹ để vệt sáng không bị chìm dưới lớp phủ (không quá chói)
          className="h-full w-full object-cover [filter:brightness(1.2)_contrast(1.1)_saturate(1.15)]"
        />
      </div>
      {/* Chỉ làm tối bên trái (vùng chữ); bên phải để trống để vệt sáng hiện rõ */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to right, rgba(5,5,8,0.8) 0%, rgba(5,5,8,0.5) 35%, rgba(5,5,8,0) 62%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(#ff1e42 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="relative z-10 flex w-full flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex-1 text-center md:text-left">
          <h1 className="font-display text-3xl font-black italic tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-4xl lg:text-5xl">
            TOOL <span className="neon-text-glow text-neon">HACK AI</span>
          </h1>
          <p className="mb-5 mt-1 font-display text-sm font-bold uppercase tracking-widest text-gray-200 sm:text-base lg:text-lg">{t("hero.slogan")}</p>
          <ul className="grid max-w-xl grid-cols-2 gap-2 pt-1 font-mono sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
            {BADGES.map(({ key, Icon }) => (
              <li key={key} className="flex items-center justify-center gap-1.5 rounded-lg border border-neon/50 bg-black/60 px-2.5 py-1.5 shadow-neon-sm">
                <Icon className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[11px] font-bold text-gray-200">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Từ md: logo đặt đúng điểm hội tụ của các vệt sáng trong GIF (~80% ngang, ~42% dọc); nhỏ hơn: xếp dưới chữ */}
        <div className="relative flex shrink-0 items-center justify-center md:absolute md:left-[80%] md:top-[42%] md:-translate-x-1/2 md:-translate-y-1/2">
          <div className="absolute h-48 w-48 rounded-full bg-red-600/20 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="" className="relative h-auto w-48 object-contain drop-shadow-[0_0_20px_rgba(255,20,50,0.9)] transition-transform duration-300 hover:scale-105 sm:w-60 md:w-52 lg:w-72 xl:w-80" />
        </div>
      </div>
    </section>
  );
}
