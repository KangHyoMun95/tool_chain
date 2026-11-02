"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/src/i18n/provider";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { CrownIcon, LogInIcon, UserPlusIcon } from "../icons";
import { useAuth } from "./AuthProvider";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

type Tab = "login" | "register";

export function AuthView() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("login");
  const { status } = useAuth();
  const router = useRouter();

  // Đã có phiên hợp lệ (vd mở /login khi đang đăng nhập) thì không cần form nữa.
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  return (
    <div className="auth-page">
      <div className="auth-lang">
        <LanguageSwitcher />
      </div>

      <div className="auth-wrap">
        <header className="auth-brand">
          <span className="auth-logo">
            <CrownIcon className="icon-lg" />
          </span>
          <h1 className="auth-brand-name">{t("brand.name")}</h1>
          <p className="auth-tagline">{t("auth.tagline")}</p>
        </header>

        <div className="card card-glass auth-card">
          <div className="auth-tabs" role="tablist" aria-label={t("auth.tabsLabel")}>
            <button
              type="button"
              role="tab"
              id="tab-login"
              aria-selected={tab === "login"}
              aria-controls="panel-login"
              className={`auth-tab${tab === "login" ? " auth-tab-active" : ""}`}
              onClick={() => setTab("login")}
            >
              <LogInIcon className="icon-sm" />
              {t("auth.tabLogin")}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-register"
              aria-selected={tab === "register"}
              aria-controls="panel-register"
              className={`auth-tab${tab === "register" ? " auth-tab-active" : ""}`}
              onClick={() => setTab("register")}
            >
              <UserPlusIcon className="icon-sm" />
              {t("auth.tabRegister")}
            </button>
          </div>

          <div role="tabpanel" id="panel-login" aria-labelledby="tab-login" hidden={tab !== "login"}>
            <LoginForm />
          </div>
          <div role="tabpanel" id="panel-register" aria-labelledby="tab-register" hidden={tab !== "register"}>
            <RegisterForm />
          </div>
        </div>
      </div>
    </div>
  );
}
