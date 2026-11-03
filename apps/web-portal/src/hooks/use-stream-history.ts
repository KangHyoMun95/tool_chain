"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { apiGet, ApiError } from "@/src/lib/api/client";

export type HistoryRow = { shoe: number; round: number; result: string | null };

type ApiHistory = { shoe: number | null; items: { shoe: number; round: number; result: string | null }[] };

const LIMIT = 72;   // đủ cho lưới 12x6 của bảng kết quả
const REFETCH_DELAY_MS = 4000;   // lớn hơn chu kỳ ghi batch của API (3s)

const rowKey = (r: { shoe: number; round: number }) => `${r.shoe}:${r.round}`;

/**
 * Lịch sử ván FINISHED của shoe hiện tại.
 * - Vào trang: fetch lịch sử (API tự chọn shoe mới nhất).
 * - `addOptimistic`: thêm ngay ván vừa có kết quả; `scheduleRefetch`: refetch MỘT lần sau ~4s, gộp theo (shoe, round).
 * - `liveShoe` khác shoe đang hiển thị: reset và fetch lại theo shoe realtime.
 * - `reconnectCount` tăng (kết nối realtime phục hồi): refetch để bù event bị lỡ.
 */
export function useStreamHistory(streamId: string, liveShoe: number | null, reconnectCount: number) {
  const { status: authStatus, markUnauthenticated } = useAuth();
  const [rows, setRows] = useState<Map<string, HistoryRow>>(new Map());
  const [shoe, setShoe] = useState<number | null>(null);        // shoe của danh sách đang hiển thị
  const [error, setError] = useState(false);
  const shoeRef = useRef<number | null>(null);
  const liveShoeRef = useRef(liveShoe);
  liveShoeRef.current = liveShoe;
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const alive = useRef(true);

  const setCurrentShoe = (s: number | null) => { shoeRef.current = s; setShoe(s); };

  const load = useCallback(async (wanted: number | null) => {
    try {
      const res = await apiGet<ApiHistory>(`/streams/${encodeURIComponent(streamId)}/game-sessions`, {
        shoe: wanted ?? undefined, limit: LIMIT,
      });
      // Bỏ phản hồi cũ: shoe đang hiển thị đã đổi trong lúc chờ.
      if (!alive.current || (shoeRef.current !== null && res.shoe !== null && res.shoe !== shoeRef.current)) return;
      if (shoeRef.current === null && res.shoe !== null) setCurrentShoe(res.shoe);
      setError(false);
      setRows((prev) => {
        const next = new Map(prev);
        for (const it of res.items) next.set(rowKey(it), { shoe: it.shoe, round: it.round, result: it.result });
        return next;
      });
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 401) markUnauthenticated();
      setError(true);
    }
  }, [streamId, markUnauthenticated]);

  // Vào trang / kết nối lại: fetch theo shoe realtime nếu đã biết, không thì để API chọn.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void load(liveShoeRef.current);
  }, [authStatus, load, reconnectCount]);

  // Shoe realtime khác shoe đang hiển thị: reset (giữ ván của shoe mới) rồi fetch lại.
  useEffect(() => {
    if (authStatus !== "authenticated" || liveShoe === null || shoe === null || liveShoe === shoe) return;
    setCurrentShoe(liveShoe);
    setRows((prev) => new Map([...prev].filter(([, r]) => r.shoe === liveShoe)));
    void load(liveShoe);
  }, [authStatus, liveShoe, shoe, load]);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [streamId]);

  const addOptimistic = useCallback((row: HistoryRow) => {
    if (shoeRef.current === null) setCurrentShoe(row.shoe);
    setRows((prev) => (prev.has(rowKey(row)) ? prev : new Map(prev).set(rowKey(row), row)));
  }, []);

  const scheduleRefetch = useCallback(() => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      void load(shoeRef.current);
    }, REFETCH_DELAY_MS);
    timers.current.add(timer);
  }, [load]);

  const list = [...rows.values()]
    .filter((r) => shoe === null || r.shoe === shoe)
    .sort((a, b) => b.round - a.round);
  return { rows: list, shoe, error, addOptimistic, scheduleRefetch };
}
