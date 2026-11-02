"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { MessageKey } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { AuthError, isValidPhone, normalizePhone, registerPhone, type AuthErrorCode } from "@/src/lib/auth";
import { SparklesIcon } from "../icons";
import { PhoneField } from "./PhoneField";

const ERROR_KEYS: Record<AuthErrorCode, MessageKey> = {
  invalid_input: "auth.errors.invalidPhone",
  invalid_credentials: "auth.errors.generic",
  locked: "auth.errors.locked",
  network: "auth.errors.network",
  unknown: "auth.errors.generic",
};

type Message = { key: MessageKey; kind: "error" | "info" };

export function RegisterForm() {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) {
      return setMessage({ key: "auth.errors.invalidPhone", kind: "error" });
    }

    setMessage(null);
    setSubmitting(true);
    try {
      await registerPhone(normalized);
      setPhone("");
      setMessage({ key: "auth.registerSuccess", kind: "info" });
    } catch (err) {
      setMessage({ key: ERROR_KEYS[err instanceof AuthError ? err.code : "unknown"], kind: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="auth-form">
      <PhoneField value={phone} onChange={setPhone} placeholder={t("auth.registerPhonePlaceholder")} />
      <p className="auth-hint">{t("auth.registerHint")}</p>

      {message && (
        <p
          className={`auth-message auth-message-${message.kind}`}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {t(message.key)}
        </p>
      )}

      <button type="submit" className="btn btn-block auth-submit auth-submit-dark" disabled={submitting}>
        {submitting ? (
          <>
            <span className="auth-spinner auth-spinner-light" aria-hidden="true" />
            {t("auth.registerLoading")}
          </>
        ) : (
          <>
            <SparklesIcon className="icon-sm" />
            {t("auth.registerSubmit")}
          </>
        )}
      </button>
    </form>
  );
}
