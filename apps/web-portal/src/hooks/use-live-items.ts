// apps/web-portal/src/hooks/use-live-items.ts
"use client";
import { useEffect, useState } from "react";
import type { Tick } from "@toolhackchain/shared";

type Status = "connecting" | "live" | "reconnecting" | "revoked";

export function useLiveItems(items: string[]) {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [status, setStatus] = useState<Status>("connecting");
  const key = items.join(",");

  useEffect(() => {
    if (!key) return;
    const es = new EventSource(
      `http://localhost:4000/api/stream?items=${encodeURIComponent(key)}`,
      { withCredentials: true },
    );
    es.onopen = () => setStatus("live");
    es.onmessage = (e) => {
      const t: Tick = JSON.parse(e.data);
      setTicks((p) => (p[t.item_id] && p[t.item_id].ts >= t.ts ? p : { ...p, [t.item_id]: t }));
    };
    es.addEventListener("revoked", () => { setStatus("revoked"); es.close(); });
    es.onerror = () => setStatus("reconnecting");
    return () => es.close();
  }, [key]);

  return { ticks, status };
}