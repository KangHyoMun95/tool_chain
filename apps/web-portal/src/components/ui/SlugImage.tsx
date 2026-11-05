"use client";

import { useState } from "react";
import { slugify } from "@/src/lib/slug";
import { cn } from "@/src/lib/cn";

type Props = {
  kind: "lobbies" | "categories";
  name: string;
  className?: string;
};

/**
 * Ảnh thẻ lobby / category: `/images/<kind>/<slug-tên>.png`. Chưa có file (404) ⇒ ô placeholder neon
 * với chữ cái đầu. Thêm ảnh = copy file vào `public/images/<kind>/`, không cần sửa code.
 */
export function SlugImage({ kind, name, className }: Props) {
  const [failed, setFailed] = useState(false);
  const slug = slugify(name);

  if (failed || !slug) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-neon/60 bg-gradient-to-br from-red-950 to-black font-display text-2xl font-black uppercase text-neon shadow-neon-sm", className)} aria-hidden="true">
        {Array.from(name)[0] ?? "?"}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/images/${kind}/${slug}.png`} alt={name} className={cn("rounded-xl object-contain", className)} onError={() => setFailed(true)} />;
}
