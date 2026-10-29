import type { ReactNode } from "react";
import { RoyalHeader, type BackLink } from "./RoyalHeader";

export function PortalShell({ back, children }: { back?: BackLink; children: ReactNode }) {
  return (
    <div className="shell">
      <RoyalHeader back={back} />
      <main className="stack">{children}</main>
    </div>
  );
}
