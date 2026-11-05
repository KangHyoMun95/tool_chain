"use client";

import { useState } from "react";

/** Ảnh trang trí (bệ, cây lúa...): thiếu file (404) thì không hiện gì, giao diện vẫn đủ nhờ các lớp CSS dự phòng. */
export function DecorImage({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" className={className} onError={() => setFailed(true)} />;
}
