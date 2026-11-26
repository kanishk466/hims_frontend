/**
 * Mock "backend" helpers: authentication, permission checks, clinic scoping and audit.
 * These mirror what the real API guards will do, so the UI cannot rely on
 * hidden buttons alone.
 */
import type { Permission } from '@/auth/permissions'
import { resolvePermissions } from '@/auth/resolve'
import type { ZodType } from 'zod'
import type { AuditEntry, User } from '@/types/auth'
import { commit, db, type DbShape } from '@/mock/db'
import { ApiError, getAuthToken, getViewAs, mockRequest, type FieldErrors } from './client'

export interface RequestContext {
  db: DbShape
  /** The person actually logged in (used for audit). */
  user: User
  /** Clinic the request is scoped to; null for platform users. */
  clinicId: string | null
  /** Effective permissions: the user's own, or the previewed user's in "See as" mode. */
  permissions: Set<Permission>
  /** Set in "See as this user" mode: the user being previewed. Everything is read-only. */
  previewOf?: User
}

/** Permission an admin needs to use "See as this user". */
export const PREVIEW_PERMISSION: Permission = 'admin.users.view'

const READ_ACTIONS = new Set(['view', 'print'])

export function authenticate(): RequestContext {
  const token = getAuthToken()
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
  const roles = store.roles.filter((r) => r.clinicId === user.clinicId)
  const own = new Set(resolvePermissions(user, roles))
  const viewAs = getViewAs()
  if (viewAs && viewAs !== user.id) {
    const target = store.users.find((u) => u.id === viewAs && u.clinicId === user.clinicId && u.status !== 'inactive')
    if (!own.has(PREVIEW_PERMISSION) || !target || !user.clinicId) {
      throw new ApiError(403, 'preview_not_allowed', 'You cannot view the app as this user.')
    }
    return { db: store, user, clinicId: user.clinicId, permissions: new Set(resolvePermissions(target, roles)), previewOf: target }
  }
  return { db: store, user, clinicId: user.clinicId, permissions: own }
}

export function requirePermission(ctx: RequestContext, permission: Permission | Permission[]) {
  const list = Array.isArray(permission) ? permission : [permission]
  if (!list.some((p) => ctx.permissions.has(p))) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to do this.')
  }
  if (ctx.previewOf && !list.some((p) => READ_ACTIONS.has(p.split('.')[2]!))) {
    throw new ApiError(403, 'preview_read_only', `You are viewing the app as ${ctx.previewOf.name}. Changes are turned off.`)
  }
}

/** Use for every clinic-scoped read: records of another clinic are invisible. */
export function requireClinic(ctx: RequestContext): string {
  if (!ctx.clinicId) throw new ApiError(403, 'no_clinic', 'This action needs a clinic user.')
  return ctx.clinicId
}

export function writeAudit(ctx: Pick<RequestContext, 'db' | 'user' | 'clinicId'>, entry: Omit<AuditEntry, 'id' | 'at' | 'userId' | 'userName' | 'clinicId'>) {
  ctx.db.auditLog.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: ctx.user.id,
    userName: ctx.user.name,
    clinicId: ctx.clinicId,
    ...entry,
  })
}

/**
 * Wrap an authenticated mock endpoint.
 * - checks the session (401) and, if given, the permission (403)
 * - saves the store after the handler runs (handlers that change data)
 */
export function endpoint<T>(permission: Permission | Permission[] | null, handler: (ctx: RequestContext) => T): Promise<T> {
  return mockRequest(() => {
    const ctx = authenticate()
    if (permission) requirePermission(ctx, permission)
    const result = handler(ctx)
    commit()
    return result
  })
}

/** Validate input with the same Zod schema the form uses; 400 with per-field messages on failure. */
export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const fieldErrors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    if (!fieldErrors[key]) fieldErrors[key] = issue.message
  }
  throw new ApiError(400, 'invalid', 'Please correct the highlighted fields.', fieldErrors)
}

export function notFound(what: string): never {
  throw new ApiError(404, 'not_found', `${what} not found.`)
}

/** 409 for duplicates, attached to the field the user should change. */
export function conflict(field: string, message: string): never {
  throw new ApiError(409, 'duplicate', message, { [field]: message })
}

/** Find a record of the caller's clinic, or 404. Records of other clinics are invisible. */
export function findInClinic<T extends { id: string; clinicId: string | null }>(rows: T[], ctx: RequestContext, id: string, what: string): T {
  const clinicId = requireClinic(ctx)
  return rows.find((r) => r.id === id && r.clinicId === clinicId) ?? notFound(what)
}

export const nowIso = () => new Date().toISOString()
