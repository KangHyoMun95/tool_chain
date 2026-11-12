"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useI18n } from "@/src/i18n/provider";
import { logout } from "@/src/lib/auth";
import { Modal } from "../ui/Modal";
import { NeonButton } from "../ui/NeonButton";
import { Spinner } from "../ui/Spinner";

/**
 * Xác nhận đăng xuất. "Có": gọi API logout (server xóa session + refresh token trong Redis và đóng ngay các kết nối SSE
 * của session), thành công ⇒ markUnauthenticated: AuthGate chuyển sang /login và gỡ trang (client đóng EventSource, dừng polling).
 * Lỗi mạng / server ⇒ báo lỗi và vẫn đăng nhập (không giả vờ đã đăng xuất khi phiên còn sống).
 */
export function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { markUnauthenticated } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) { setBusy(false); setFailed(false); }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await logout();
      markUnauthenticated();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("shell.logoutTitle")} dismissible={!busy}>
      <p className="text-sm text-gray-300">{t("shell.logoutConfirm")}</p>
      {failed && <p role="alert" className="mt-3 text-xs font-semibold text-rose-400">{t("shell.logoutFailed")}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <NeonButton variant="ghost" className="px-5 py-2 text-sm" onClick={onClose} disabled={busy}>{t("shell.logoutNo")}</NeonButton>
        <NeonButton className="px-5 py-2 text-sm" onClick={confirm} disabled={busy}>
          {busy && <Spinner className="h-3.5 w-3.5 border-white/30 border-t-white" />}
          {t("shell.logoutYes")}
        </NeonButton>
      </div>
    </Modal>
  );
}
