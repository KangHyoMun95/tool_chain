"use client";

import { useId } from "react";
import { useI18n } from "@/src/i18n/provider";
import { UserIcon } from "../icons";
import { AUTH_INPUT_CLASS, AuthField } from "./AuthField";

/** Tên hiển thị (không bắt buộc, tối đa 50 ký tự). */
export function DisplayNameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const id = useId();

  return (
    <AuthField id={id} label={t("auth.displayNameLabel")} icon={<UserIcon className="h-5 w-5" />}>
      <input
        id={id}
        type="text"
        autoComplete="nickname"
        maxLength={50}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("auth.displayNamePlaceholder")}
        className={AUTH_INPUT_CLASS}
      />
    </AuthField>
  );
}
