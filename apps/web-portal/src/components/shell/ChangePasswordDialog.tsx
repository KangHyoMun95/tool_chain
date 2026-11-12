"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useI18n } from "@/src/i18n/provider";
import { ChangePasswordError, changePassword, MIN_PASSWORD_LENGTH } from "@/src/lib/auth";
import { Modal } from "../ui/Modal";
import { NeonButton } from "../ui/NeonButton";
import { Spinner } from "../ui/Spinner";

const INPUT_CLASS =
  "w-full rounded-xl border border-neon/20 bg-[#16161c]/90 px-3.5 py-2.5 text-sm text-white outline-none transition-all focus:border-neon focus:shadow-[0_0_14px_rgba(255,30,66,0.35)]";

function PasswordInput({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">{label}</label>
      <input id={id} type="password" required maxLength={128} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />
    </div>
  );
}

/**
 * Đổi mật khẩu: mật khẩu cũ, mật khẩu mới (>= 12 ký tự, khớp rule của API), xác nhận. Kiểm tra độ dài / khớp ở client chỉ để báo sớm;
 * server vẫn kiểm tra lại. Thành công ⇒ báo xong, đóng bằng nút (phiên hiện tại giữ nguyên, thiết bị khác bị đăng xuất).
 */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) { setCurrent(""); setNext(""); setConfirm(""); setBusy(false); setError(null); setDone(false); }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN_PASSWORD_LENGTH) return setError(t("shell.passwordTooShort"));
    if (next !== confirm) return setError(t("shell.passwordMismatch"));
    if (next === current) return setError(t("shell.passwordSame"));
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      const code = err instanceof ChangePasswordError ? err.code : "unknown";
      setError(
        code === "wrong_password" ? t("shell.passwordWrong")
        : code === "same_password" ? t("shell.passwordSame")
        : code === "invalid_input" ? t("shell.passwordTooShort")
        : code === "locked" ? t("shell.passwordTooMany")
        : t("shell.passwordFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("shell.changePasswordTitle")} dismissible={!busy}>
      {done ? (
        <>
          <p role="status" className="text-sm text-emerald-400">{t("shell.passwordChanged")}</p>
          <div className="mt-5 flex justify-end">
            <NeonButton className="px-5 py-2 text-sm" onClick={onClose}>{t("shell.passwordClose")}</NeonButton>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3.5">
          <PasswordInput label={t("shell.currentPassword")} value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordInput label={t("shell.newPassword")} value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordInput label={t("shell.confirmPassword")} value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {error && <p role="alert" className="text-xs font-semibold text-rose-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <NeonButton variant="ghost" className="px-5 py-2 text-sm" onClick={onClose} disabled={busy}>{t("shell.passwordCancel")}</NeonButton>
            <NeonButton type="submit" className="px-5 py-2 text-sm" disabled={busy}>
              {busy && <Spinner className="h-3.5 w-3.5 border-white/30 border-t-white" />}
              {t("shell.passwordSubmit")}
            </NeonButton>
          </div>
        </form>
      )}
    </Modal>
  );
}
