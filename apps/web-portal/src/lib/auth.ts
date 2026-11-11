// Gọi API đăng nhập / khôi phục phiên. Access token chỉ giữ trong bộ nhớ (không localStorage / cookie):
// mất khi tải lại trang, khi đó khôi phục bằng refresh token (cookie httpOnly do API đặt) qua POST /auth/refresh.

// NEXT_PUBLIC_API_URL có thể là gốc (http://host:4000) hoặc đã kèm /api; luôn chuẩn hóa về <gốc>/api.
const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "").replace(/\/api$/, "")}/api`;

/** URL đầy đủ của một đường dẫn API (vd "/stream"). */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;

export type AuthErrorCode = "invalid_input" | "invalid_credentials" | "locked" | "network" | "unknown";

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}

let accessToken: string | null = null;
export const getAccessToken = (): string | null => accessToken;

/** Bỏ khoảng trắng và dấu gạch ngang người dùng hay gõ. */
export const normalizePhone = (raw: string): string => raw.replace(/[\s-]/g, "");

/** Khớp ràng buộc API (6–20 ký tự), chỉ nhận chữ số. */
export const isValidPhone = (phone: string): boolean => /^\d{6,20}$/.test(phone);

/** Gửi số điện thoại để Admin cấp tài khoản (API công khai, không cần đăng nhập). Kết quả giống nhau dù số đã tồn tại hay chưa. */
export async function registerPhone(phone: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/users-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phone }),
    });
  } catch {
    throw new AuthError("network");
  }

  if (res.status === 429) throw new AuthError("locked");
  if (res.status === 400) throw new AuthError("invalid_input");
  if (!res.ok) throw new AuthError("unknown");
}

async function readAccessToken(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  const token = (body as { access_token?: unknown } | null)?.access_token;
  return typeof token === "string" ? token : null;
}

/** Role trong claim của access token (chỉ để chặn phía UI; API vẫn kiểm tra role ở từng route). */
function isUserToken(token: string): boolean {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as { role?: unknown }).role === "USER";
  } catch {
    return false;
  }
}

async function isTokenValid(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

// Refresh token được xoay mỗi lần gọi và dùng lại token cũ sẽ thu hồi cả phiên ⇒ KHÔNG được gọi đồng thời
// (vd React StrictMode chạy effect hai lần, hoặc nhiều request cùng gặp 401). Mọi lời gọi dùng chung một promise đang chạy.
let refreshing: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
      if (!res.ok) return false;
      const token = await readAccessToken(res);
      // Cookie refresh dùng chung với web-admin (cùng site): phiên HOST / ADMIN không được vào portal.
      if (token === null || !isUserToken(token)) return false;
      accessToken = token;
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * fetch tới API kèm Bearer. Gặp 401 (access token hết hạn) thì làm mới token MỘT lần rồi gọi lại;
 * nhiều request cùng hết hạn chia sẻ một lần refresh. Lỗi mạng thì ném TypeError như fetch.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(`${API_BASE}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken ?? ""}` } });
  const res = await send();
  if (res.status !== 401) return res;
  if (!(await refreshAccessToken())) {
    accessToken = null;
    return res;
  }
  return send();
}

let restoring: Promise<boolean> | null = null;

/**
 * Kiểm tra phiên: có access token trong bộ nhớ thì xác minh bằng GET /auth/me; không có hoặc không hợp lệ thì thử
 * khôi phục bằng refresh token. Trả về true nếu đang có phiên hợp lệ. API không truy cập được cũng coi là chưa đăng nhập.
 */
export function restoreSession(): Promise<boolean> {
  if (restoring) return restoring;
  restoring = (async () => {
    if (accessToken !== null) {
      if (await isTokenValid(accessToken)) return true;
      accessToken = null;
    }
    return refreshAccessToken();
  })().finally(() => {
    restoring = null;
  });
  return restoring;
}

export async function login(phone: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phone, password, audience: "portal" }),
    });
  } catch {
    throw new AuthError("network");
  }

  if (res.status === 401) throw new AuthError("invalid_credentials");
  if (res.status === 429) throw new AuthError("locked");
  if (res.status === 400) throw new AuthError("invalid_input");
  if (!res.ok) throw new AuthError("unknown");

  const token = await readAccessToken(res);
  if (token === null) throw new AuthError("unknown");
  if (!isUserToken(token)) throw new AuthError("invalid_credentials");
  accessToken = token;
}

/**
 * Đăng xuất: POST /auth/logout (server xóa session + refresh token trong Redis, đóng các kết nối SSE, xóa cookie refresh).
 * 401 nghĩa là phiên đã không còn (hết hạn / bị thu hồi) nên coi như đã đăng xuất. Lỗi mạng / 5xx ⇒ ném AuthError, token giữ nguyên.
 */
export async function logout(): Promise<void> {
  let res: Response;
  try {
    res = await authFetch("/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    throw new AuthError("network");
  }
  if (!res.ok && res.status !== 401) throw new AuthError("unknown");
  accessToken = null;
}
