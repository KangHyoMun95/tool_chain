"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ApiError } from "@/src/lib/api/client";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; data: T };

type Options = {
  /** Gọi lại API định kỳ (ms) để cập nhật ngầm: không hiện "đang tải", lỗi tạm thời thì giữ dữ liệu cũ. */
  refreshMs?: number;
};

/**
 * Gọi API khi đã đăng nhập và mỗi khi `deps` đổi. API trả 401 (không làm mới được token) thì đánh dấu chưa đăng nhập
 * để trang chuyển sang /login. `fetcher = null` nghĩa là chưa cần gọi (vd chưa chọn sảnh).
 * Có `refreshMs` thì tự làm mới định kỳ; tạm dừng khi tab bị ẩn và làm mới ngay khi tab hiện lại.
 */
export function useApi<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[],
  { refreshMs }: Options = {},
): ApiState<T> & { reload: () => void } {
  const { status: authStatus, markUnauthenticated } = useAuth();
  const [state, setState] = useState<ApiState<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const enabled = fetcher !== null;

  useEffect(() => {
    const run = fetcherRef.current;
    if (authStatus !== "authenticated" || !run) return;
    let alive = true;
    setState({ status: "loading" });
    run().then(
      (data) => alive && setState({ status: "success", data }),
      (err: unknown) => {
        if (!alive) return;
        const error = err instanceof ApiError ? err : new ApiError(0);
        if (error.status === 401) markUnauthenticated();
        setState({ status: "error", error });
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, enabled, tick, markUnauthenticated, ...deps]);

  // Làm mới ngầm định kỳ. Không chồng request: còn request trước đang chạy thì bỏ qua nhịp này.
  useEffect(() => {
    if (authStatus !== "authenticated" || !enabled || !refreshMs) return;
    let alive = true;
    let inFlight = false;

    const refresh = async () => {
      const run = fetcherRef.current;
      if (!run || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await run();
        if (alive) setState({ status: "success", data });
      } catch (err) {
        if (alive && err instanceof ApiError && err.status === 401) markUnauthenticated();
        // lỗi khác (mạng, 5xx): giữ dữ liệu đang hiển thị, thử lại ở nhịp sau
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(() => void refresh(), refreshMs);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, enabled, refreshMs, markUnauthenticated, ...deps]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}
