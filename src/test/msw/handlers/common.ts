/**
 * Shared helpers for every MSW handler module: build the base URL handlers match against,
 * authenticate a request the same way the real backend's PermissionsGuard would (reading the
 * Authorization/X-View-As headers instead of client.ts's in-memory variables, since those
 * never cross the simulated network), and turn an ApiError into the exact JSON shape the real
 * backend's HttpExceptionFilter produces.
 */
import { HttpResponse } from 'msw'
import type { Permission } from '@/auth/permissions'
import { resolvePermissions } from '@/auth/resolve'
import { ApiError } from '@/api/client'
import type { RequestContext } from '@/api/_server'
import { db, commit } from '@/mock/db'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'
export const url = (path: string) => `${API_BASE}${path}`

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization')
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined
}

const PREVIEW_PERMISSION: Permission = 'admin.users.view'

/**
 * Same resolution PermissionsGuard does server-side, but reading headers off the
 * intercepted Request instead of a shared client-side variable. Produces the exact same
 * `RequestContext` shape `_server.ts` uses, so every handler/rule helper there (requirePermission,
 * requireClinic, findInClinic, conflict, notFound, writeAudit, validate) works unchanged here —
 * no logic is duplicated between the two.
 */
export function authenticateFromRequest(request: Request): RequestContext {
  const token = bearerToken(request)
  const store = db()
  const session = token ? store.sessions.find((s) => s.token === token) : undefined
  const user = session ? store.users.find((u) => u.id === session.userId) : undefined
  if (!session || !user || user.status !== 'active') {
    throw new ApiError(401, 'unauthenticated', 'Your session has ended. Please log in again.')
  }
  const clinic = user.clinicId ? store.clinics.find((c) => c.id === user.clinicId) : undefined
  if (user.clinicId && (!clinic || clinic.status === 'suspended')) {
    throw new ApiError(401, 'clinic_suspended', 'This clinic’s account is suspended. Contact support.')
  }
  const own = new Set(resolvePermissions(user, store.roles))
  const viewAs = request.headers.get('x-view-as')
  if (viewAs && viewAs !== user.id) {
    const target = store.users.find((u) => u.id === viewAs && u.clinicId === user.clinicId && u.status !== 'inactive')
    if (!own.has(PREVIEW_PERMISSION) || !target || !user.clinicId) {
      throw new ApiError(403, 'preview_not_allowed', 'You cannot view the app as this user.')
    }
    return { db: store, user, clinicId: user.clinicId, permissions: new Set(resolvePermissions(target, store.roles)), previewOf: target }
  }
  return { db: store, user, clinicId: user.clinicId, permissions: own }
}

/** Runs a handler body, commits the mock store on success, and maps a thrown ApiError (or
 *  any other error) to the exact {code,message,fieldErrors,details} shape the real backend's
 *  exception filter produces — so client.ts's error parsing is identical in test and in prod. */
export async function respond<T>(fn: () => T | Promise<T>, successStatus = 200): Promise<Response> {
  try {
    const result = await fn()
    commit()
    if (result === undefined) return new HttpResponse(null, { status: 204 })
    return HttpResponse.json(result, { status: successStatus })
  } catch (e) {
    if (e instanceof ApiError) {
      return HttpResponse.json({ code: e.code, message: e.message, fieldErrors: e.fieldErrors, details: e.details }, { status: e.status })
    }
    return HttpResponse.json({ code: 'internal', message: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
