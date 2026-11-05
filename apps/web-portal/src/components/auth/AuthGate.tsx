"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useI18n } from "@/src/i18n/provider";
import { Spinner } from "../ui/Spinner";
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="status">
        <Spinner className="h-8 w-8 border-neon/30 border-t-neon" />
        <p className="font-mono text-xs uppercase tracking-widest text-slate-hud">{t("auth.checking")}</p>
      </div>
    );
  }
  return <>{children}</>;
}
