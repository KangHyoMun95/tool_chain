"use client";

import type { ReactNode } from "react";
import { useExitNavigation } from "@/src/hooks/use-exit-navigation";
import { cn } from "@/src/lib/cn";
import { AuthGate } from "../auth/AuthGate";
import { AppHeader } from "./AppHeader";
import { ShellExitContext } from "./ShellExit";
import { Sidebar } from "./Sidebar";

type Props = {
  children: ReactNode;
  /** Hiện sidebar (trang chủ / lobby); mục đang xem lấy theo đường dẫn. */
  sidebar?: boolean;
};

/** Khung chung của các trang cần đăng nhập: header + (sidebar) + nội dung. Cung cấp trạng thái thoát trang cho các khối con. */
export function AppShell({ children, sidebar }: Props) {
  const exit = useExitNavigation();

  return (
    <AuthGate>
      <ShellExitContext.Provider value={exit}>
        <div className={cn("mx-auto flex w-full flex-col gap-3.5 p-2.5 sm:p-4", sidebar ? "max-w-[1580px]" : "max-w-[1240px]")}>
          <AppHeader />
          {sidebar ? (
            <div className="flex flex-1 flex-col gap-3.5 lg:flex-row">
              <Sidebar />
              <main className="flex min-w-0 flex-1 flex-col gap-3.5">{children}</main>
            </div>
          ) : (
            <main className="flex flex-col gap-3.5 pb-6">{children}</main>
          )}
        </div>
      </ShellExitContext.Provider>
    </AuthGate>
  );
}
