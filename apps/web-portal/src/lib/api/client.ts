import { authFetch } from "@/src/lib/auth";

/** status 0 = không kết nối được máy chủ. */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API ${status}`);
  }
}

type Params = Record<string, string | number | undefined>;

export async function apiGet<T>(path: string, params: Params = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.size > 0 ? `?${query}` : "";

  let res: Response;
  try {
    res = await authFetch(`${path}${qs}`);
  } catch {
    throw new ApiError(0);
  }
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}
