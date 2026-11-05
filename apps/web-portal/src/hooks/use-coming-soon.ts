"use client";

import { useCallback } from "react";
import { useI18n } from "@/src/i18n/provider";

/** Hàm báo "Coming soon" cho các nút chưa có chức năng (NẠP TIỀN, chuông, menu, VIP...). */
export function useComingSoon(): () => void {
  const { t } = useI18n();
  return useCallback(() => window.alert(t("common.comingSoon")), [t]);
}
