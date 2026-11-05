import type { HTMLAttributes } from "react";
import { cn } from "@/src/lib/cn";

type Props = HTMLAttributes<HTMLDivElement> & { glow?: boolean; panel?: boolean };

/** Khối nền chuẩn của giao diện: `hud-card` (chi tiết bàn) hoặc `neon-panel` (trang chủ / sidebar / ticker). */
export function HudCard({ glow, panel, className, ...rest }: Props) {
  return <div className={cn(panel ? "neon-panel" : "hud-card", glow && "hud-card-glow", className)} {...rest} />;
}
