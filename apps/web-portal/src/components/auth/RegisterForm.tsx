"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { MessageKey } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { AuthError, isValidPhone, normalizePhone, register, type AuthErrorCode } from "@/src/lib/auth";
import { Spinner } from "../ui/Spinner";
import { ArrowRightIcon } from "../icons";
import { DisplayNameField } from "./DisplayNameField";
import { PasswordField } from "./PasswordField";
import { PhoneField } from "./PhoneField";

const ERROR_KEYS: Record<AuthErrorCode, MessageKey> = {
  invalid_input: "auth.errors.invalidInput",
  invalid_credentials: "auth.errors.generic",
  locked: "auth.errors.locked",
  network: "auth.errors.network",
  unknown: "auth.errors.generic",
  registration_failed: "auth.errors.registrationFailed",
  register_limit: "auth.errors.registerLimit",
  captcha_failed: "auth.errors.captchaFailed",
  not_ready: "auth.errors.notReady",
  password_mismatch: "auth.errors.passwordMismatch",
};

// Cùng quy tắc với API: mật khẩu 12–128 ký tự, tên hiển thị 1–50 ký tự (đã trim) và không có ký tự điều khiển.
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const DISPLAY_NAME_MAX = 50;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

type Phase = "idle" | "verifying" | "sending";

export function RegisterForm({ telegramUrl, onRegistered }: { telegramUrl: string | null; onRegistered: () => void }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<MessageKey | null>(null);

  const busy = phase !== "idle";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const normalized = normalizePhone(phone);
    const name = displayName.trim();
    if (!isValidPhone(normalized)) return setError("auth.errors.invalidPhone");
    if (name.length > DISPLAY_NAME_MAX || CONTROL_CHARS.test(name)) return setError("auth.errors.invalidDisplayName");
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return setError("auth.errors.passwordRule");
    if (password !== confirm) return setError("auth.errors.passwordMismatch");

    setError(null);
    setPhase("verifying");
    try {
      await register({ phone: normalized, displayName: name, password, confirmPassword: confirm }, () => setPhase("sending"));
      setPassword("");
      setConfirm("");
      onRegistered();
    } catch (err) {
      setError(ERROR_KEYS[err instanceof AuthError ? err.code : "unknown"]);
    } finally {
      setPhase("idle");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <PhoneField value={phone} onChange={setPhone} placeholder={t("auth.registerPhonePlaceholder")} />
      <DisplayNameField value={displayName} onChange={setDisplayName} />
      <PasswordField value={password} onChange={setPassword} placeholder={t("auth.registerPasswordPlaceholder")} autoComplete="new-password" />
      <PasswordField
        value={confirm}
        onChange={setConfirm}
        placeholder={t("auth.confirmPasswordPlaceholder")}
        label={t("auth.confirmPasswordLabel")}
        autoComplete="new-password"
      />

      {error && (
        <p className="rounded-lg border border-neon/50 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
          {t(error)}
          {error === "auth.errors.registerLimit" && telegramUrl && (
            <>
              {" "}
              <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-neon underline hover:text-red-400">
                Telegram
              </a>
            </>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="btn-fx cyber-btn-red flex w-full select-none items-center justify-center gap-2 rounded-xl border border-neon-soft py-3.5 font-display text-sm font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy ? (
          <>
            <Spinner />
            {t(phase === "verifying" ? "auth.registerVerifying" : "auth.registerLoading")}
          </>
        ) : (
          <>
            {t("auth.registerSubmit")}
            <ArrowRightIcon className="fx-arrow-right h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
