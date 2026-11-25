"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ResultTone = "win" | "loss" | "draw";

/** Thời gian hiện ảnh (ms), phải khớp độ dài animation result-overlay-* trong globals.css. */
const SHOW_MS = 2600;
const SRC: Record<ResultTone, string> = { win: "/images/win.png", loss: "/images/lose.png", draw: "/images/tie.png" };
/** Ảnh riêng cho kết quả "bộ ba" (ký hiệu B của Tài xỉu, thuộc draw): thay tie.png, dùng animation của draw. */
const TRIPLE_SRC = "/images/triple.png";

/**
 * Ảnh win / lose / tie (hoặc triple) ở giữa màn hình ~2.6s khi ván có kết quả so với dự đoán, mỗi ván (roundKey) một lần.
 * Win: từ trong ra ngoài, nhanh và dứt khoát. Loss: từ trên xuống. Draw: từ trong ra ngoài, nhẹ nhàng.
 * Render qua portal vào body: các khối cha có transform (stagger) sẽ làm `fixed` bị neo theo khối thay vì màn hình.
 */
export function ResultOverlay({ tone, roundKey, triple = false }: { tone: ResultTone | null; roundKey: string; triple?: boolean }) {
  const [shown, setShown] = useState<{ tone: ResultTone; key: string; triple: boolean } | null>(null);
  const lastKey = useRef<string | null>(null);

  // Nạp sẵn ảnh để lần đầu hiện không bị trễ (tie.png).
  useEffect(() => {
    [...Object.values(SRC), TRIPLE_SRC].forEach((src) => { new Image().src = src; });
  }, []);

  // Chỉ hiện khi kết quả ĐẾN trong lúc đang xem (đã thấy ván này chưa có kết quả), không hiện khi vào trang / tải lại
  // lúc ván đã có kết quả sẵn.
  const pendingKey = useRef<string | null>(null);
  useEffect(() => {
    if (!tone) { pendingKey.current = roundKey; return; }
    if (pendingKey.current !== roundKey || lastKey.current === roundKey) return;
    lastKey.current = roundKey;
    setShown({ tone, key: roundKey, triple: tone === "draw" && triple });
  }, [tone, roundKey, triple]);

  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [shown]);

  if (!shown || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center px-4" aria-hidden="true">
      <div className="result-overlay-dim absolute inset-0 bg-black/45" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={shown.key}
        src={shown.triple ? TRIPLE_SRC : SRC[shown.tone]}
        alt=""
        draggable={false}
        className={`result-overlay-${shown.tone} relative h-auto w-[min(92vw,640px)] select-none drop-shadow-[0_0_28px_rgba(255,200,60,0.55)]`}
      />
    </div>,
    document.body,
  );
}
