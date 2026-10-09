/**
 * The single API client. Same-origin session auth: Django sets `sessionid`
 * (httpOnly) and `csrftoken`; we echo the CSRF token on unsafe methods.
 */

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: FieldErrors = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = "/api/v1";
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NOT_AUTHENTICATED = "Authentication credentials were not provided.";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfPromise: Promise<void> | null = null;
async function ensureCsrf(): Promise<string> {
  if (!getCookie("csrftoken")) {
    csrfPromise ??= fetch(`${BASE}/auth/csrf/`, { credentials: "same-origin" }).then(() => {
      csrfPromise = null;
    });
    await csrfPromise;
  }
  return getCookie("csrftoken") ?? "";
}

/** Called when the session is missing/expired. Set by the auth layer. */
let onUnauthenticated: () => void = () => {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
};
export function setUnauthenticatedHandler(fn: () => void) {
  onUnauthenticated = fn;
}

function normaliseErrors(raw: unknown): FieldErrors {
  if (!raw || typeof raw !== "object") return {};
  const out: FieldErrors = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return out;
}

export type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

export function toQueryString(params?: Query): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, String(v)));
    else qs.append(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  /** Skip the redirect-to-login behaviour (used by the login/me calls). */
  noAuthRedirect?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (UNSAFE.has(method)) headers["X-CSRFToken"] = await ensureCsrf();

  const res = await fetch(`${BASE}${path}${toQueryString(opts.query)}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
  });

  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const detail: string = data?.detail ?? res.statusText ?? "Request failed";
    // DRF session auth answers 403 (not 401) when not logged in.
    const unauthenticated =
      res.status === 401 || (res.status === 403 && detail === NOT_AUTHENTICATED);
    if (unauthenticated && !opts.noAuthRedirect) onUnauthenticated();
    throw new ApiError(res.status, detail, normaliseErrors(data?.errors));
  }
  return data as T;
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const del = (path: string) => api<void>(path, { method: "DELETE" });

export function isUnauthenticated(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.status === 401 || (err.status === 403 && err.message === NOT_AUTHENTICATED))
  );
}
