"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { MessageKey } from "@/src/i18n/config";
import { useI18n } from "@/src/i18n/provider";
import { AuthError, isValidPhone, normalizePhone, registerPhone, type AuthErrorCode } from "@/src/lib/auth";
import { Spinner } from "../ui/Spinner";
import { ArrowRightIcon } from "../icons";
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
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <PhoneField value={phone} onChange={setPhone} placeholder={t("auth.registerPhonePlaceholder")} />
      <p className="text-xs leading-relaxed text-zinc-400">{t("auth.registerHint")}</p>

      {message && (
        <p
          className={
            message.kind === "error"
              ? "rounded-lg border border-neon/50 bg-red-950/40 px-3 py-2 text-sm text-red-200"
              : "rounded-lg border border-ai/50 bg-green-950/30 px-3 py-2 text-sm text-ai-soft"
          }
          role={message.kind === "error" ? "alert" : "status"}
        >
          {t(message.key)}
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
            {t("auth.registerLoading")}
          </>
        ) : (
          <>
            {t("auth.registerSubmit")}
            <ArrowRightIcon className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
