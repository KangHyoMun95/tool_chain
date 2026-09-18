/** Base URL of the NestJS API (already includes the /api global prefix). */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const TOKEN_KEY = 'thc_token';
const USERNAME_KEY = 'thc_username';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string, username: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  } catch {
    /* storage unavailable — ignore */
  }
}

export function getStoredUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Clears the session and hard-redirects to the login page. Used when the JWT
 * is rejected by the API (expired / invalid / user no longer exists). Guarded
 * so it is a no-op on the server and when already on /login (avoids a loop
 * when a bad-credentials login also returns 401).
 */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

/** fetch wrapper that attaches the JWT and parses JSON, throwing on non-2xx. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    // Expired / invalid / unknown token -> back to login.
    if (res.status === 401) {
      redirectToLogin();
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
