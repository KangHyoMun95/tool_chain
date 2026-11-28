"use client";

import { useState } from "react";
import { slugify } from "@/src/lib/slug";
import { cn } from "@/src/lib/cn";

const IMAGE_EXTS = ["jpeg", "png"] as const;

type Props = {
  kind: "lobbies" | "categories";
  name: string;
  className?: string;
  /** Cỡ chữ của placeholder (mặc định text-2xl; dùng text-xs cho ô nhỏ). */
  fallbackText?: string;
};

/**
 * Ảnh thẻ lobby / category: `/images/<kind>/<slug_tên>.jpeg` (hoặc `.png`). Chưa có file (404) ⇒ ô placeholder neon
 * với chữ cái đầu. Thêm ảnh = copy file vào `public/images/<kind>/`, không cần sửa code.
 */
export function SlugImage({ kind, name, className, fallbackText = "text-2xl" }: Props) {
  const [extIndex, setExtIndex] = useState(0);   // thử lần lượt từng đuôi file; hết đuôi ⇒ placeholder
  const slug = slugify(name);

  if (extIndex >= IMAGE_EXTS.length || !slug) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-neon/60 bg-gradient-to-br from-red-950 to-black font-display font-black uppercase text-neon shadow-neon-sm", fallbackText, className)} aria-hidden="true">
        {Array.from(name)[0] ?? "?"}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/images/${kind}/${slug}.${IMAGE_EXTS[extIndex]}`} alt={name} className={cn("rounded-xl object-contain", className)} onError={() => setExtIndex((i) => i + 1)} />;
}
