"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ResultTone = "win" | "loss" | "draw";

/** Thời gian hiện ảnh (ms), phải khớp độ dài animation result-overlay-* trong globals.css. */
const SHOW_MS = 2000;
const SRC: Record<ResultTone, string> = { win: "/images/win.png", loss: "/images/loss.png", draw: "/images/draw.png" };

/**
 * Ảnh win / loss / draw ở giữa màn hình ~2s khi ván có kết quả so với dự đoán, mỗi ván (roundKey) một lần.
 * Win: từ trong ra ngoài, nhanh và dứt khoát. Loss: từ trên xuống. Draw: từ trong ra ngoài, nhẹ nhàng.
 * Render qua portal vào body: các khối cha có transform (stagger) sẽ làm `fixed` bị neo theo khối thay vì màn hình.
 */
export function ResultOverlay({ tone, roundKey }: { tone: ResultTone | null; roundKey: string }) {
  const [shown, setShown] = useState<{ tone: ResultTone; key: string } | null>(null);
  const lastKey = useRef<string | null>(null);

  // Nạp sẵn ảnh để lần đầu hiện không bị trễ (draw.png ~1MB).
  useEffect(() => {
    Object.values(SRC).forEach((src) => { new Image().src = src; });
  }, []);

  // Chỉ hiện khi kết quả ĐẾN trong lúc đang xem (đã thấy ván này chưa có kết quả), không hiện khi vào trang / tải lại
  // lúc ván đã có kết quả sẵn.
  const pendingKey = useRef<string | null>(null);
  useEffect(() => {
    if (!tone) { pendingKey.current = roundKey; return; }
    if (pendingKey.current !== roundKey || lastKey.current === roundKey) return;
    lastKey.current = roundKey;
    setShown({ tone, key: roundKey });
  }, [tone, roundKey]);

  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [shown]);

  if (!shown || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center px-4" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={shown.key}
        src={SRC[shown.tone]}
        alt=""
        draggable={false}
        className={`result-overlay-${shown.tone} h-auto w-[min(86vw,560px)] select-none`}
      />
    </div>,
    document.body,
  );
}
