import type { z } from "zod";
import { config } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thrown when a response doesn't match its schema: a contract mismatch, not a network fault. */
export class ContractError extends Error {
  constructor(
    readonly path: string,
    readonly issues: string,
  ) {
    super(`Response from ${path} didn't match the expected shape`);
    this.name = "ContractError";
  }
}

type TokenGetter = () => string | null;
type UnauthorizedHandler = () => void;

let getToken: TokenGetter = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

/** The session module registers itself here, so the client never imports app state. */
export function configureApiClient(opts: { getToken: TokenGetter; onUnauthorized: UnauthorizedHandler }) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

export type Query = Record<string, string | number | boolean | null | undefined | readonly string[]>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${config.apiBaseUrl}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

interface RequestOptions<T extends z.ZodType> {
  schema: T;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Public endpoints skip the auth header and 401 handling. */
  anonymous?: boolean;
}

export async function request<T extends z.ZodType>(path: string, opts: RequestOptions<T>): Promise<z.infer<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = opts.anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      credentials: "include",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "Couldn't reach the server. Check your connection", path);
  }

  if (res.status === 401 && !opts.anonymous) {
    onUnauthorized();
    throw new ApiError(401, "Your session has ended. Sign in again", path);
  }
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const body = (await res.json()) as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch {
      // Body wasn't JSON; keep the status text.
    }
    throw new ApiError(res.status, message, path);
  }

  const json: unknown = res.status === 204 ? null : await res.json();
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[api] ${path} failed schema validation`, parsed.error.issues);
    throw new ContractError(path, parsed.error.message);
  }
  return parsed.data;
}

/** File downloads (CSV, PDF). Same auth and error handling as `request`, no schema. */
export async function requestBlob(
  path: string,
  opts: { query?: Query; anonymous?: boolean; signal?: AbortSignal } = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const headers: Record<string, string> = {};
  const token = opts.anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { headers, signal: opts.signal, credentials: "include" });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "Couldn't reach the server. Check your connection", path);
  }
  if (res.status === 401 && !opts.anonymous) {
    onUnauthorized();
    throw new ApiError(401, "Your session has ended. Sign in again", path);
  }
  if (!res.ok) {
    let message = res.statusText || "Export failed";
    try {
      message = ((await res.json()) as { detail?: string }).detail ?? message;
    } catch {
      // Not JSON.
    }
    throw new ApiError(res.status, message, path);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null;
  return { blob: await res.blob(), filename };
}

/** Human message for any error a query can throw. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "You don't have access to this. Ask an administrator";
    return err.message;
  }
  if (err instanceof ContractError) return "The server sent data in an unexpected shape";
  return "Something went wrong";
}
