"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useI18n } from "@/src/i18n/provider";
import { useAuth } from "./AuthProvider";

// Bọc các trang cần đăng nhập: kiểm tra token trước, chưa hợp lệ thì chuyển sang /login (đăng nhập / đăng ký).
// Chỉ là lớp UI; quyền truy cập dữ liệu thật vẫn do API kiểm tra token.
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="auth-checking" role="status">
        <span className="auth-spinner auth-spinner-lg" aria-hidden="true" />
        <p className="hint">{t("auth.checking")}</p>
      </div>
    );
  }
  return <>{children}</>;
}
