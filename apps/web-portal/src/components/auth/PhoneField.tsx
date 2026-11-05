"use client";

import { useId } from "react";
import { useI18n } from "@/src/i18n/provider";
import { PhoneIcon } from "../icons";
import { AUTH_INPUT_CLASS, AuthField } from "./AuthField";

export function PhoneField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();

  return (
    <AuthField id={id} label={t("auth.phoneLabel")} icon={<PhoneIcon className="h-5 w-5" />}>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        maxLength={32}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={AUTH_INPUT_CLASS}
      />
    </AuthField>
  );
}
