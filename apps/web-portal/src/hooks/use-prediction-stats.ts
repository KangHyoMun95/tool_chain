"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ApiError } from "@/src/lib/api/client";
import { fetchBestStreak, fetchPredictionStats, type PredictionStatsDto } from "@/src/lib/api/predictions";

/**
 * Tỷ lệ thắng, chuỗi thắng tốt nhất của shoe hiện tại (API best-streak) và tỷ lệ thắng các shoe các ván gần nhất của một stream (dữ liệu thật từ API).
 * - Vào trang / kết nối realtime phục hồi: fetch.
 * - `scheduleRefresh(delay)`: fetch lại sau `delay` ms (sau khi có kết quả: chờ API ghi batch; sau khi có dự đoán: gần như ngay).
 */
export function usePredictionStats(streamId: string, reconnectCount: number) {
  const { status: authStatus, markUnauthenticated } = useAuth();
  const [stats, setStats] = useState<(PredictionStatsDto & { best_streak: number }) | null>(null);
  const [error, setError] = useState(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const [res, best] = await Promise.all([fetchPredictionStats(streamId), fetchBestStreak(streamId)]);
      if (!alive.current) return;
      setStats({ ...res, best_streak: best.best_streak });
      setError(false);
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 401) markUnauthenticated();
      setError(true);
    }
  }, [streamId, markUnauthenticated]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void load();
  }, [authStatus, load, reconnectCount]);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [streamId]);

  const scheduleRefresh = useCallback((delayMs: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      void load();
    }, delayMs);
    timers.current.add(timer);
  }, [load]);

  return { stats, error, scheduleRefresh };
}
