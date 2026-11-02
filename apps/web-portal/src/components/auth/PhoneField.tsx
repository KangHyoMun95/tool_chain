"use client";

import { useId } from "react";
import { useI18n } from "@/src/i18n/provider";
import { PhoneIcon } from "../icons";

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
    <div className="field">
      <label htmlFor={id} className="field-label">
        {t("auth.phoneLabel")}
      </label>
      <div className="field-control">
        <PhoneIcon className="field-icon" />
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
          className="field-input"
        />
      </div>
    </div>
  );
}
