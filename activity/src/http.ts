/**
 * Every request an Activity makes is sandboxed behind the Discord proxy at
 * https://<CLIENT_ID>.discordsays.com/.proxy/ — a bare "/members/points" is
 * blocked by CSP. The `.proxy` prefix became optional in July 2025, but keeping
 * it explicit works on both old and new clients.
 *
 * Override with VITE_API_BASE when running `vite dev` against the real API
 * outside of Discord (e.g. VITE_API_BASE=https://api.flamingpalm.com).
 */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/.proxy";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Full URL for a path on our API, for places that can't use fetch (e.g. <img src>). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(apiUrl(path), init);

  if (!response.ok) {
    // The bot's API replies with plain-text error bodies, not JSON.
    const body = await response.text().catch(() => "");
    throw new ApiError(body || `Request failed (${response.status})`, response.status);
  }

  return response;
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getJson<T>(path: string, token?: string): Promise<T> {
  const response = await request(path, { headers: authHeaders(token) });
  return response.json() as Promise<T>;
}

export async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}

/** POST for endpoints that answer with an empty or plain-text body. */
export async function post(path: string, body: unknown, token?: string): Promise<void> {
  await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
}
