/**
 * Transport layer. Today it runs mock handlers in-process; later this file
 * becomes the real HTTP client (fetch/axios with the same ApiError shape),
 * and screens do not change.
 */

export interface FieldErrors {
  [field: string]: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors?: FieldErrors
  /** Extra data for the screen, e.g. the possible duplicate patients. */
  readonly details?: unknown

  constructor(status: number, code: string, message: string, fieldErrors?: FieldErrors, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

/** Equivalent of the Authorization header. Set by the session store. */
let authToken: string | null = null
export function setAuthToken(token: string | null) {
  authToken = token
}
export function getAuthToken() {
  return authToken
}

/**
 * "See as this user": the admin's requests are answered with another user's
 * permissions, read-only. Equivalent of an X-View-As header.
 */
let viewAsUserId: string | null = null
export function setViewAs(userId: string | null) {
  viewAsUserId = userId
}
export function getViewAs() {
  return viewAsUserId
}

const isTest = import.meta.env.MODE === 'test'

function latency(min = 150, max = 400): Promise<void> {
  if (isTest) return Promise.resolve()
  const ms = min + Math.random() * (max - min)
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Run a mock handler like a network call: async, with latency, and returning a
 * deep copy so screens can never mutate the store by accident.
 *
 * Stage 6 is migrating api/*.ts files, one area at a time, off this and onto `request()` below.
 * Any api file not yet migrated still imports this (via _server.ts's `endpoint()`), so it stays
 * until the last one (Stage 6g) is converted.
 */
export async function mockRequest<T>(handler: () => T): Promise<T> {
  await latency()
  const result = handler()
  return result === undefined ? result : structuredClone(result)
}

/** Key the mock store is saved under; screens listen for changes to it (cross-tab sync). */
export { DB_STORAGE_KEY as DB_STORAGE_KEY_PUBLIC } from '@/mock/db'

/** Base URL of the real backend, including its global prefix (see hims-server's own .env). */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

/**
 * The real HTTP client: every migrated api/*.ts function calls this instead of `mockRequest`.
 * Sends the bearer token and, in "See as this user" mode, X-View-As, exactly like the mock's
 * `_server.ts#authenticate()` read them from this module's own state — only now as headers on
 * an actual (or, in tests, MSW-intercepted) request. Parses the backend's {code, message,
 * fieldErrors, details} error body into the same ApiError every screen already handles.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const token = getAuthToken()
  if (token) headers['authorization'] = `Bearer ${token}`
  const viewAs = getViewAs()
  if (viewAs) headers['x-view-as'] = viewAs

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.')
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  // An empty-but-ok (2xx) body means "nothing here" (e.g. no vitals yet, nobody left in the
  // queue) — Nest's Express adapter sends a bodyless response for a handler that resolves to
  // `null`, the same as it does for `undefined`, rather than a literal "null" JSON body. Treat
  // it as `null`, not `undefined`: every api/*.ts function typed `T | null` expects that, and
  // TanStack Query throws if a query function resolves to `undefined`.
  const data: unknown = text ? JSON.parse(text) : null
  if (!res.ok) {
    const body = (data ?? {}) as { code?: string; message?: string; fieldErrors?: FieldErrors; details?: unknown }
    throw new ApiError(res.status, body.code ?? 'unknown', body.message ?? 'Something went wrong. Please try again.', body.fieldErrors, body.details)
  }
  return data as T
}
