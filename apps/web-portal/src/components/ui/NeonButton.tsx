import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/src/lib/cn";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60";
const VARIANTS = {
  primary: "btn-fx cyber-btn-red border border-neon-soft",
  ghost: "btn-fx border border-neon/40 bg-neon/5 text-neon hover:bg-neon/15",
} as const;

type Variant = keyof typeof VARIANTS;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };
export function NeonButton({ variant = "primary", className, ...rest }: ButtonProps) {
  return <button type="button" className={cn(BASE, VARIANTS[variant], className)} {...rest} />;
}

/** Cùng kiểu nút nhưng là liên kết điều hướng. */
export function NeonLink({ href, variant = "primary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} className={cn(BASE, VARIANTS[variant], className)}>{children}</Link>;
}
