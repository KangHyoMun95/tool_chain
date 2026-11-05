"use client";

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

  return (
    <section
      className={cn(
        "neon-panel relative flex min-h-[220px] items-center overflow-hidden px-6 py-6 sm:px-10 lg:min-h-[260px]",
        leaving ? EXIT_HERO : "animate-banner-in",
      )}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(5,5,8,0.85) 0%, rgba(5,5,8,0.5) 50%, rgba(5,5,8,0.7) 100%), url(/images/banner-home.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(#ff1e42 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="relative z-10 flex w-full flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex-1 text-center md:text-left">
          <h1 className="font-display text-3xl font-black italic tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-4xl lg:text-5xl">
            TOOL <span className="neon-text-glow text-neon">HACK AI</span>
          </h1>
          <p className="mb-5 mt-1 font-display text-sm font-bold uppercase tracking-widest text-gray-200 sm:text-base lg:text-lg">{t("hero.slogan")}</p>
          <ul className="grid max-w-xl grid-cols-2 gap-2 pt-1 font-mono sm:grid-cols-4">
            {BADGES.map(({ key, Icon }) => (
              <li key={key} className="flex items-center justify-center gap-1.5 rounded-lg border border-neon/50 bg-black/60 px-2.5 py-1.5 shadow-neon-sm">
                <Icon className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[11px] font-bold text-gray-200">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex shrink-0 items-center justify-center">
          <div className="absolute h-44 w-44 rounded-full bg-red-600/30 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="" className="relative h-auto w-48 object-contain drop-shadow-[0_0_20px_rgba(255,20,50,0.9)] transition-transform duration-300 hover:scale-105 sm:w-60 lg:w-72" />
        </div>
      </div>
    </section>
  );
}
