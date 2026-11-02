"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { MessageKey } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { AuthError, isValidPhone, login, normalizePhone, type AuthErrorCode } from "@/src/lib/auth";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, LockIcon } from "../icons";
import { useAuth } from "./AuthProvider";
import { PhoneField } from "./PhoneField";

const ERROR_KEYS: Record<AuthErrorCode, MessageKey> = {
  invalid_input: "auth.errors.invalidPhone",
  invalid_credentials: "auth.errors.invalidCredentials",
  locked: "auth.errors.locked",
  network: "auth.errors.network",
  unknown: "auth.errors.generic",
};

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const { markAuthenticated } = useAuth();
  const passwordId = useId();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) return setError("auth.errors.invalidPhone");
    if (password === "") return setError("auth.errors.passwordRequired");

    setError(null);
    setSubmitting(true);
    try {
      await login(normalized, password);
      markAuthenticated();
      router.replace("/");
    } catch (err) {
      setError(ERROR_KEYS[err instanceof AuthError ? err.code : "unknown"]);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="auth-form">
      <PhoneField value={phone} onChange={setPhone} placeholder={t("auth.phonePlaceholder")} autoFocus />

      <div className="field">
        <label htmlFor={passwordId} className="field-label">
          {t("auth.passwordLabel")}
        </label>
        <div className="field-control">
          <LockIcon className="field-icon" />
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="field-input field-input-action"
          />
          <button
            type="button"
            className="field-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOffIcon className="icon-sm" /> : <EyeIcon className="icon-sm" />}
          </button>
        </div>
      </div>

      {error && (
        <p className="auth-message auth-message-error" role="alert">
          {t(error)}
        </p>
      )}

      <button type="submit" className="btn btn-block auth-submit" disabled={submitting}>
        {submitting ? (
          <>
            <span className="auth-spinner" aria-hidden="true" />
            {t("auth.loginLoading")}
          </>
        ) : (
          <>
            {t("auth.loginSubmit")}
            <ArrowRightIcon className="icon-sm" />
          </>
        )}
      </button>
    </form>
  );
}
