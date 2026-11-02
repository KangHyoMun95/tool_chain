"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { restoreSession } from "@/src/lib/auth";

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  /** Gọi ngay sau khi đăng nhập thành công (token đã nằm trong bộ nhớ). */
  markAuthenticated: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Kiểm tra token một lần khi tải trang; chưa có token hợp lệ thì các trang được bảo vệ chuyển sang /login.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");

  useEffect(() => {
    let alive = true;
    void restoreSession().then((ok) => {
      if (alive) setStatus(ok ? "authenticated" : "unauthenticated");
    });
    return () => {
      alive = false;
    };
  }, []);

  const markAuthenticated = useCallback(() => setStatus("authenticated"), []);
  const value = useMemo(() => ({ status, markAuthenticated }), [status, markAuthenticated]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
