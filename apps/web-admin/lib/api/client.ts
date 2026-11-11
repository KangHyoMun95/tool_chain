import { ADMIN_APP_ROLES, type Role } from '../auth/roles';

// NEXT_PUBLIC_API_URL có thể là gốc (http://host:4000) hoặc đã kèm /api; luôn chuẩn hóa về <gốc>/api.
const ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
export const API_BASE = `${ORIGIN}/api`;

/** GET /auth/me. `balance` là bigint ở dạng chuỗi (không tính toán bằng Number). */
export interface MeResponse {
  user_id: string;
  phone_number: string;
  role: Role;
  status: string;
  balance: string;
  refer_user_id: string | null;
  can_participate: boolean;
}

export interface SessionUser {
  sub: string;
  role: Role;
  phone: string;
}

export type AuthErrorCode = 'invalid_input' | 'invalid_credentials' | 'locked' | 'network' | 'unknown';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}

// Access token chỉ giữ trong bộ nhớ (không localStorage): mất khi tải lại trang, khi đó khôi phục bằng refresh token
// (cookie httpOnly do API đặt) qua POST /auth/refresh.
let accessToken: string | null = null;
let sessionUser: SessionUser | null = null;

export const getToken = (): string | null => accessToken;
export const getSessionUser = (): SessionUser | null => sessionUser;

function clearSession(): void {
  accessToken = null;
  sessionUser = null;
  try {
    // Phiên bản cũ lưu token ở localStorage: dọn đi.
    localStorage.removeItem('thc_token');
    localStorage.removeItem('thc_username');
  } catch {
    /* storage không dùng được */
  }
}

/** Xóa phiên rồi về trang đăng nhập (no-op ở server và khi đã ở /login để không lặp). */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  clearSession();
  if (window.location.pathname !== '/login') window.location.replace('/login');
}

async function readAccessToken(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  const token = (body as { access_token?: unknown } | null)?.access_token;
  return typeof token === 'string' ? token : null;
}

/**
 * Xác minh token bằng GET /auth/me rồi nhận phiên. Chỉ HOST / ADMIN và tài khoản ACTIVE được vào web-admin: cookie refresh
 * dùng chung với web-portal (cùng site) nên phiên của USER có thể khôi phục được ở đây và phải bị bỏ.
 */
async function establish(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const me = (await res.json()) as MeResponse;
    if (!ADMIN_APP_ROLES.includes(me.role) || me.status !== 'ACTIVE') return false;
    accessToken = token;
    sessionUser = { sub: me.user_id, role: me.role, phone: me.phone_number };
    return true;
  } catch {
    return false;
  }
}

// Refresh token được xoay mỗi lần gọi và dùng lại token cũ sẽ thu hồi cả phiên ⇒ KHÔNG gọi đồng thời
// (React StrictMode chạy effect hai lần, nhiều request cùng gặp 401): mọi lời gọi dùng chung một promise.
let refreshing: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const token = await readAccessToken(res);
      return token !== null && (await establish(token));
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Có phiên hợp lệ không: đã có trong bộ nhớ thì dùng luôn, không thì thử khôi phục bằng refresh token. */
export async function restoreSession(): Promise<boolean> {
  if (accessToken !== null && sessionUser !== null) return true;
  return refreshAccessToken();
}

export async function login(phone: string, password: string): Promise<SessionUser> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, password, audience: 'admin' }),
    });
  } catch {
    throw new AuthError('network');
  }
  if (res.status === 401) throw new AuthError('invalid_credentials');
  if (res.status === 429) throw new AuthError('locked');
  if (res.status === 400) throw new AuthError('invalid_input');
  if (!res.ok) throw new AuthError('unknown');

  const token = await readAccessToken(res);
  if (token === null) throw new AuthError('unknown');
  if (!(await establish(token)) || sessionUser === null) throw new AuthError('invalid_credentials');
  return sessionUser;
}

/**
 * POST /auth/logout (server xóa session + refresh token trong Redis và cookie). 401 = phiên đã không còn, coi như xong.
 * Lỗi mạng / 5xx ⇒ ném AuthError và giữ phiên (không giả vờ đã đăng xuất khi phiên server còn sống).
 */
export async function logout(): Promise<void> {
  let res: Response;
  try {
    res = await authFetch('/auth/logout', { method: 'POST' });
  } catch {
    throw new AuthError('network');
  }
  if (!res.ok && res.status !== 401) throw new AuthError('unknown');
  clearSession();
}

/** fetch kèm Bearer; gặp 401 thì làm mới token MỘT lần rồi gọi lại. */
async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
        Authorization: `Bearer ${accessToken ?? ''}`,
      },
    });
  const res = await send();
  if (res.status !== 401) return res;
  if (!(await refreshAccessToken())) {
    clearSession();
    return res;
  }
  return send();
}

/** fetch tới API, parse JSON, ném Error khi không phải 2xx. 401 không làm mới được ⇒ về /login. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    if (res.status === 401) redirectToLogin();
    const body = await res.json().catch(() => ({}));
    const message = (body as { message?: string | string[] }).message;
    throw new Error(Array.isArray(message) ? message.join(', ') : (message ?? `HTTP ${res.status}`));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
