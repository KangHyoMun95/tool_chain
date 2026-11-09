// apps/web-portal/src/hooks/use-live-items.ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { RealtimePrediction, RealtimeTick } from "@toolhackchain/shared";
import { apiUrl } from "@/src/lib/auth";

// Trang demo /live nhận tick kiểu bất kỳ (BTC/ETH...); trang stream dùng CrawlPayload (mặc định của RealtimeTick).
type LiveTick<D> = Omit<RealtimeTick<D>, "stream_id" | "type"> & { type?: "tick"; stream_id?: string | null };
type Status = "connecting" | "live" | "reconnecting" | "revoked";

type Options<D> = {
  /** Chỉ nhận tick có stream_id khớp HOẶC null (đã lọc theo key_id lúc subscribe; null = chưa có trong cache id của API). */
  streamId?: string;
  /** Gọi cho mọi tick hợp lệ mới hơn tick đã có (kể cả khi nội dung không đổi). Dùng bản mới nhất của hàm, không cần useCallback. */
  onTick?: (t: LiveTick<D>) => void;
  /** Gọi cho event SSE `type: "prediction"` của đúng stream (kênh public theo key_id). */
  onPrediction?: (p: RealtimePrediction) => void;
};

export function useLiveItems<D = Record<string, unknown>>(items: string[], { streamId, onTick, onPrediction }: Options<D> = {}) {
  const [ticks, setTicks] = useState<Record<string, LiveTick<D>>>({});
  const [status, setStatus] = useState<Status>("connecting");
  const [reconnectCount, setReconnectCount] = useState(0);   // tăng mỗi lần kết nối lại thành công sau khi mất kết nối
  const key = items.join(",");
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onPredictionRef = useRef(onPrediction);
  onPredictionRef.current = onPrediction;

  useEffect(() => {
    if (!key) return;
    let dropped = false;
    const latestTs = new Map<string, number>();
    const es = new EventSource(
      apiUrl(`/stream?items=${encodeURIComponent(key)}`),
      { withCredentials: true },
    );
    es.onopen = () => {
      setStatus("live");
      if (dropped) { dropped = false; setReconnectCount((n) => n + 1); }
    };
    es.onmessage = (e) => {
      let msg: LiveTick<D> | RealtimePrediction;
      try { msg = JSON.parse(e.data); } catch { return; }
      // Event thiếu `type` (API bản cũ) coi là tick. Prediction không đi qua logic chống tick cũ / state của tick.
      if (msg.type === "prediction") {
        if (!streamId || msg.stream_id === streamId) onPredictionRef.current?.(msg);
        return;
      }
      const t = msg;
      if (streamId && t.stream_id != null && t.stream_id !== streamId) return;
      if ((latestTs.get(t.item_id) ?? -Infinity) >= t.ts) return;
      latestTs.set(t.item_id, t.ts);
      onTickRef.current?.(t);
      // Chỉ cập nhật state khi dữ liệu thực sự đổi (tick dày, nhiều tick giống nhau).
      setTicks((p) => {
        const old = p[t.item_id];
        return old && JSON.stringify(old.data) === JSON.stringify(t.data) ? p : { ...p, [t.item_id]: t };
      });
    };
    es.addEventListener("revoked", () => { setStatus("revoked"); es.close(); });
    es.onerror = () => { dropped = true; setStatus("reconnecting"); };
    return () => es.close();
  }, [key, streamId]);

  return { ticks, status, reconnectCount };
}
