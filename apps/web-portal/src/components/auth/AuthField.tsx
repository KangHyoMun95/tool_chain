import type { ReactNode } from "react";

export const AUTH_INPUT_CLASS =
  "w-full rounded-xl border border-neon/20 bg-[#16161c]/90 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-zinc-500 outline-none transition-all focus:border-neon focus:bg-[#19181f] focus:shadow-[0_0_14px_rgba(255,30,66,0.35)]";

/** Khung một ô nhập của form đăng nhập/đăng ký: nhãn (ẩn trên desktop theo thiết kế), icon trái, nội dung (input) và phần phụ bên phải. */
export function AuthField({ id, label, icon, children }: { id: string; label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5 text-left">
      <label htmlFor={id} className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300 lg:sr-only">
        {label}
      </label>
      <div className="group relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neon/70 transition-colors group-focus-within:text-neon">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
