import type { ReactNode } from "react";
import { BackButton, type BackLink } from "./BackButton";
import { AppShell } from "./shell/AppShell";

// TẠM THỜI (xóa ở PR 4): chỉ còn StreamDetailView dùng, vì trang chi tiết chưa chuyển giao diện.
export function PortalShell({ back, children }: { back?: BackLink; children: ReactNode }) {
  return (
    <AppShell>
      {back && <div><BackButton back={back} /></div>}
      <div className="stack">{children}</div>
    </AppShell>
  );
}
