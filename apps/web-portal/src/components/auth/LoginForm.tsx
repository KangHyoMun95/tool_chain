"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import type { MessageKey } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { AuthError, isValidPhone, login, normalizePhone, type AuthErrorCode } from "@/src/lib/auth";
import { Spinner } from "../ui/Spinner";
import { ArrowRightIcon } from "../icons";
import { useAuth } from "./AuthProvider";
import { PasswordField } from "./PasswordField";
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
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
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
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <PhoneField value={phone} onChange={setPhone} placeholder={t("auth.phonePlaceholder")} autoFocus />
      <PasswordField value={password} onChange={setPassword} placeholder={t("auth.passwordPlaceholder")} />

      {error && (
        <p className="rounded-lg border border-neon/50 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
          {t(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="cyber-btn-red flex w-full items-center justify-center gap-2 rounded-xl border border-neon-soft py-3.5 font-display text-sm font-bold uppercase tracking-widest text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? (
          <>
            <Spinner />
            {t("auth.loginLoading")}
          </>
        ) : (
          <>
            {t("auth.loginSubmit")}
            <ArrowRightIcon className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
