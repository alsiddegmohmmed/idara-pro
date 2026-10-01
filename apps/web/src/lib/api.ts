import type { AccessView } from "@idara-pro/shared";
// Minimal API client. The access token lives in memory only (never localStorage);
// the refresh token is an httpOnly cookie the browser sends to /api/v1/auth/*.

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** The server's `error.details` (e.g. distance and radius for a rejected punch). */
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; details?: Record<string, unknown> } };
    return new ApiError(response.status, body.error?.code ?? "unknown_error", body.error?.details ?? {});
  } catch {
    return new ApiError(response.status, "unknown_error");
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** `identifier`: national ID / iqama number (employees) or email (accounts without an employee record). */
export async function login(identifier: string, password: string): Promise<void> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  accessToken = ((await response.json()) as { accessToken: string }).accessToken;
}

/** Accepting an invitation signs the new user in (same shape as login). */
export async function acceptInvitation(token: string, password: string): Promise<void> {
  const response = await fetch("/api/v1/auth/invitations/accept", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  accessToken = ((await response.json()) as { accessToken: string }).accessToken;
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const response = await fetch("/api/v1/auth/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const response = await fetch("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
}

let refreshing: Promise<boolean> | null = null;

/**
 * Uses the refresh cookie to get a new access token. Returns false if there is no valid session.
 * Refresh tokens rotate and a reused one revokes the whole family, so concurrent callers
 * (React StrictMode's double mount, a burst of parallel 401s) must share ONE request.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const response = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
  if (!response.ok) {
    accessToken = null;
    return false;
  }
  accessToken = ((await response.json()) as { accessToken: string }).accessToken;
  return true;
}

export async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
  accessToken = null;
}

/** Authenticated request; on 401 it refreshes once and retries. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (): Promise<Response> =>
    fetch(path, {
      ...init,
      credentials: "include",
      headers: { ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
  let response = await send();
  if (response.status === 401 && (await refreshSession())) {
    response = await send();
  }
  return response;
}

/** The token only says who the user is; what they may do comes from GET /auth/access (ADR-0011 §4). */
export interface AccessTokenClaims {
  sub: string;
  companyId: string;
  exp?: number;
}

/** Reads the (already server-verified) token payload for display only — never for security decisions. */
export function readClaims(): AccessTokenClaims | null {
  if (!accessToken) return null;
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return null;
  }
}

/** The signed-in user's permissions with reach, and the branches they reach (GET /auth/access). */
export function fetchAccess(): Promise<AccessView> {
  return apiJson<AccessView>("/api/v1/auth/access");
}

/** Authenticated JSON call: throws ApiError (with the server's error code) on failure. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined && !(init.body instanceof FormData);
  const response = await apiFetch(path, {
    ...init,
    headers: { ...(hasBody ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}
