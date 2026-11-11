"use client";

import { useI18n } from "@/src/i18n/provider";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { Modal } from "../ui/Modal";
import { NeonButton } from "../ui/NeonButton";

/** Dialog chọn ngôn ngữ: đổi ngay khi chọn (lưu cookie như LanguageSwitcher). */
export function LanguageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t("shell.menuLanguage")}>
      <LanguageSwitcher />
      <div className="mt-5 flex justify-end">
        <NeonButton variant="ghost" className="px-5 py-2 text-sm" onClick={onClose}>{t("common.close")}</NeonButton>
      </div>
    </Modal>
  );
}
