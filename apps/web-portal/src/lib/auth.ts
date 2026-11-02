// Gọi API đăng nhập / khôi phục phiên. Access token chỉ giữ trong bộ nhớ (không localStorage / cookie):
// mất khi tải lại trang, khi đó khôi phục bằng refresh token (cookie httpOnly do API đặt) qua POST /auth/refresh.

// NEXT_PUBLIC_API_URL có thể là gốc (http://host:4000) hoặc đã kèm /api; luôn chuẩn hóa về <gốc>/api.
const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "").replace(/\/api$/, "")}/api`;

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

async function isTokenValid(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

// Refresh token được xoay mỗi lần gọi và dùng lại token cũ sẽ thu hồi cả phiên ⇒ KHÔNG được gọi đồng thời
// (vd React StrictMode chạy effect hai lần). Mọi lời gọi dùng chung một promise đang chạy.
async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    const token = await readAccessToken(res);
    if (token === null) return false;
    accessToken = token;
    return true;
  } catch {
    return false;
  }
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
      body: JSON.stringify({ phone_number: phone, password }),
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
  accessToken = token;
}
