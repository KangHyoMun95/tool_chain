import { cn } from "@/src/lib/cn";

/** Vòng quay nhỏ (đang gửi form / đang kiểm tra phiên). Màu theo `currentColor` của viền sáng. */
export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white", className)} aria-hidden="true" />;
}
