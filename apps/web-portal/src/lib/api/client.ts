import { authFetch } from "@/src/lib/auth";

/** status 0 = không kết nối được máy chủ. code = mã lỗi nghiệp vụ trong body (vd "INSUFFICIENT_BALANCE" kèm 402). */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | null = null) {
    super(`API ${status}${code ? ` ${code}` : ""}`);
  }
}

/** 402 INSUFFICIENT_BALANCE: USER không đủ điểm để vào trang chi tiết / tham gia stream. */
export const isInsufficientBalance = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 402 && err.code === "INSUFFICIENT_BALANCE";

type Params = Record<string, string | number | undefined>;

async function readError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const code = (body as { code?: unknown } | null)?.code;
  return new ApiError(res.status, typeof code === "string" ? code : null);
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await authFetch(path, init);
  } catch {
    throw new ApiError(0);
  }
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string, params: Params = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.size > 0 ? `?${query}` : "";
  return send<T>(`${path}${qs}`);
}

export const apiPost = <T>(path: string, body: unknown): Promise<T> =>
  send<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
