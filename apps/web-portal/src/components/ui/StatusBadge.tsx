"use client";

import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";

export type ConnectionState = "live" | "offline" | "reconnecting";

const STYLES: Record<ConnectionState, { box: string; dot: string; text: string }> = {
  live: { box: "border-ai/60 bg-green-950/60 shadow-[0_0_10px_rgba(34,197,94,0.4)]", dot: "bg-ai animate-pulse", text: "text-ai-soft" },
  offline: { box: "border-gray-600 bg-gray-800/80", dot: "bg-gray-400", text: "text-gray-400" },
  reconnecting: { box: "border-neon/60 bg-red-950/60 shadow-[0_0_10px_rgba(255,30,66,0.4)]", dot: "bg-neon animate-pulse", text: "text-neon-soft" },
};

/** Huy hiệu trạng thái kết nối: LIVE (xanh) / OFFLINE (xám) / MẤT KẾT NỐI (đỏ, đang thử lại). */
export function StatusBadge({ state, className }: { state: ConnectionState; className?: string }) {
  const { t } = useI18n();
  const s = STYLES[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1", s.box, className)}>
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
      <span className={cn("font-mono text-[11px] font-bold uppercase tracking-wider", s.text)}>{t(`status.${state}`)}</span>
    </span>
  );
}
