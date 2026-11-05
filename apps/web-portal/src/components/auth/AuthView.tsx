"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { ActivityIcon, CrosshairIcon, ShieldCheckIcon } from "../icons";
import { useAuth } from "./AuthProvider";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

type Mode = "login" | "register";

const BADGES = [
  { key: "auth.badgeAccurate", Icon: CrosshairIcon },
  { key: "auth.badgeStable", Icon: ActivityIcon },
  { key: "auth.badgeSecure", Icon: ShieldCheckIcon },
] as const;

// "inert" (React 18 chưa có kiểu): panel đang ẩn không nhận Tab / đọc màn hình.
const INERT = { inert: "" } as Record<string, string>;

export function AuthView() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const { status } = useAuth();
  const router = useRouter();

  // Đã có phiên hợp lệ (vd mở /login khi đang đăng nhập) thì không cần form nữa.
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const panel = (id: Mode, title: string, subtitle: string, body: ReactNode, switchText: string, switchAction: string, target: Mode) => (
    <div
      id={`panel-${id}`}
      className="flex w-1/2 flex-col justify-center p-6 sm:p-8"
      aria-hidden={mode !== id}
      {...(mode !== id ? INERT : {})}
    >
      <div className="mb-6 text-left lg:text-center">
        <div className="flex items-center gap-2 lg:justify-center">
          <span className="inline-block h-4 w-1.5 rounded-sm bg-neon shadow-[0_0_8px_#ff1e42] lg:hidden" />
          <h2 className="font-display text-base font-bold uppercase tracking-wide text-white sm:text-lg lg:text-3xl lg:neon-text-glow">{title}</h2>
        </div>
        <p className="mt-1 pl-3.5 text-xs text-zinc-400 sm:text-sm lg:pl-0">{subtitle}</p>
      </div>
      {body}
      <p className="mt-6 text-center text-xs text-zinc-400 sm:text-sm">
        {switchText}
        <button
          type="button"
          onClick={() => setMode(target)}
          className="ml-1 font-semibold uppercase tracking-wide text-neon transition-colors hover:text-red-400 hover:underline focus:outline-none"
        >
          {switchAction}
        </button>
      </p>
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Nền: khung HUD mờ + lớp tối để dễ đọc */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hud-frame.png" alt="" className="h-full w-full scale-105 object-cover object-center opacity-45 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-void/80 via-void/75 to-void/90" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-5 py-6 lg:px-12">
        <div className="grid w-full grid-cols-1 items-center gap-6 lg:grid-cols-12 lg:gap-12">
          <section className="flex flex-col items-center px-2 text-center lg:col-span-6 lg:px-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo.png"
              alt={t("brand.name")}
              className="h-auto w-[190px] object-contain drop-shadow-[0_0_25px_rgba(255,30,66,0.65)] transition-transform duration-300 hover:scale-105 lg:w-full lg:max-w-[380px]"
            />
            <p className="mb-6 mt-1 hidden font-display text-lg font-semibold uppercase tracking-widest text-red-200/90 drop-shadow-[0_0_8px_rgba(255,30,66,0.5)] lg:block">
              {t("auth.slogan")}
            </p>
            <ul className="hidden flex-wrap items-center justify-center gap-4 lg:flex">
              {BADGES.map(({ key, Icon }) => (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-neon/40 bg-black/60 px-3 py-1.5 shadow-[0_0_10px_rgba(255,30,66,0.15)] transition-all hover:border-neon hover:shadow-[0_0_15px_rgba(255,30,66,0.35)]"
                >
                  <span className="rounded-full bg-neon/20 p-1 text-neon"><Icon className="h-4 w-4" /></span>
                  <span className="font-display text-sm font-bold uppercase tracking-wider text-gray-200">{t(key)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mx-auto w-full max-w-md animate-entrance-down lg:col-span-6">
            <div className="relative overflow-hidden rounded-2xl border-2 border-neon bg-black/75 shadow-[0_0_25px_rgba(255,30,66,0.7),0_0_50px_rgba(255,30,66,0.35),inset_0_0_20px_rgba(255,30,66,0.2)] backdrop-blur-xl">
              {/* Bốn góc khung HUD */}
              <span className="pointer-events-none absolute left-2 top-2 z-20 h-4 w-4 border-l-2 border-t-2 border-neon-soft" />
              <span className="pointer-events-none absolute right-2 top-2 z-20 h-4 w-4 border-r-2 border-t-2 border-neon-soft" />
              <span className="pointer-events-none absolute bottom-2 left-2 z-20 h-4 w-4 border-b-2 border-l-2 border-neon-soft" />
              <span className="pointer-events-none absolute bottom-2 right-2 z-20 h-4 w-4 border-b-2 border-r-2 border-neon-soft" />

              {/* Hai form cạnh nhau trong một dải 200%, trượt ngang khi chuyển */}
              <div className={cn("flex w-[200%] transition-transform duration-500 ease-out", mode === "register" && "-translate-x-1/2")}>
                {panel("login", t("auth.loginTitle"), t("auth.loginSubtitle"), <LoginForm />, t("auth.noAccount"), t("auth.registerNow"), "register")}
                {panel("register", t("auth.registerTitle"), t("auth.registerSubtitle"), <RegisterForm />, t("auth.haveAccount"), t("auth.loginNow"), "login")}
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 flex flex-col items-center pb-3 pt-2 text-center font-mono text-[10px] tracking-wider text-zinc-500 lg:hidden">
        <span className="flex items-center gap-1.5 text-zinc-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ai shadow-[0_0_6px_#10b981]" />
          {t("auth.sslNotice")}
        </span>
        <span className="mt-1 text-zinc-600">{t("auth.copyright", { year: new Date().getFullYear() })}</span>
      </footer>
    </div>
  );
}
