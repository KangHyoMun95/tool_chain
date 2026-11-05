"use client";

import { useId, useState } from "react";
import { useI18n } from "@/src/i18n/provider";
import { EyeIcon, EyeOffIcon, LockIcon } from "../icons";
import { AUTH_INPUT_CLASS, AuthField } from "./AuthField";

export function PasswordField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const { t } = useI18n();
  const id = useId();
  const [show, setShow] = useState(false);

  return (
    <AuthField id={id} label={t("auth.passwordLabel")} icon={<LockIcon className="h-5 w-5" />}>
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete="current-password"
        required
        maxLength={128}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${AUTH_INPUT_CLASS} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={t(show ? "auth.hidePassword" : "auth.showPassword")}
        aria-pressed={show}
        className={`absolute inset-y-0 right-0 flex items-center pr-3.5 transition-colors hover:text-white focus:outline-none ${show ? "text-neon" : "text-zinc-400"}`}
      >
        {show ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
      </button>
    </AuthField>
  );
}
