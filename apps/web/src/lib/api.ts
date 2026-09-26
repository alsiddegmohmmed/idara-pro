// Minimal API client. The access token lives in memory only (never localStorage);
// the refresh token is an httpOnly cookie the browser sends to /api/v1/auth/*.

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return new ApiError(response.status, body.error?.code ?? "unknown_error");
  } catch {
    return new ApiError(response.status, "unknown_error");
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function login(email: string, password: string): Promise<void> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  accessToken = ((await response.json()) as { accessToken: string }).accessToken;
}

/** Uses the refresh cookie to get a new access token. Returns false if there is no valid session. */
export async function refreshSession(): Promise<boolean> {
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

export interface AccessTokenClaims {
  sub: string;
  companyId: string;
  permissions: string[];
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
