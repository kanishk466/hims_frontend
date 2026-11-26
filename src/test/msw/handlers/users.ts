/**
 * HTTP-shaped twin of the old mock logic in src/api/users.ts (now wired to real HTTP, Stage
 * 6f) — ported line-for-line onto the real backend's /admin/users/* routes, including the
 * discount-override PIN route (PATCH :id/pin), whose mock logic used to live in the same file.
 */
import { http, type HttpHandler } from 'msw'
import type { Role, User, UserInput } from '@/types/auth'
import { overridePinSchema, userInputSchema } from '@/types/auth'
import type { DbShape } from '@/mock/db'
import { hashPassword } from '@/mock/password'
import { INVITE_VALID_HOURS, newInviteToken, usernameFrom } from '@/mock/provision'
import { ApiError } from '@/api/client'
import { conflict, findInClinic, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { authenticateFromRequest, respond, url } from './common.js'

function summarise(db: DbShape, u: User) {
  const doctor = u.doctorId ? db.doctors.find((d) => d.id === u.doctorId) : undefined
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    mobile: u.mobile,
    email: u.email,
    designation: u.designation,
    status: u.status,
    roles: db.roles.filter((r) => u.roleIds.includes(r.id)).map((r) => ({ id: r.id, name: r.name })),
    doctor: doctor ? { id: doctor.id, name: doctor.name } : null,
    lastLoginAt: u.lastLoginAt,
    hasOverridePin: !!u.pinHash,
  }
}

function checkRules(ctx: RequestContext, data: UserInput, selfId?: string) {
  const clinicId = requireClinic(ctx)
  const mine = ctx.db.users.filter((u) => u.clinicId === clinicId && u.id !== selfId && u.status !== 'inactive')
  if (mine.some((u) => u.mobile === data.mobile)) conflict('mobile', 'Another active user has this mobile number.')
  if (data.email && ctx.db.users.some((u) => u.id !== selfId && u.status !== 'inactive' && u.email?.toLowerCase() === data.email!.toLowerCase())) {
    conflict('email', 'Another user has this email address.')
  }
  const validRoles = new Set(ctx.db.roles.filter((r) => r.clinicId === clinicId && r.active).map((r) => r.id))
  if (!data.roleIds.every((r) => validRoles.has(r))) throw new ApiError(400, 'invalid', 'Unknown role.', { roleIds: 'Choose roles from the list' })
  if (data.doctorId) {
    const doctor = ctx.db.doctors.find((d) => d.id === data.doctorId && d.clinicId === clinicId)
    if (!doctor) throw new ApiError(400, 'invalid', 'Unknown doctor.', { doctorId: 'Choose a doctor from the list' })
    const other = ctx.db.users.find((u) => u.doctorId === data.doctorId && u.id !== selfId && u.status !== 'inactive')
    if (other) conflict('doctorId', `${doctor.name} is already linked to ${other.name}’s login.`)
  }
}

function linkDoctor(db: DbShape, user: User, doctorId: string | null | undefined) {
  for (const d of db.doctors) if (d.userId === user.id) delete d.userId
  user.doctorId = doctorId || undefined
  if (doctorId) db.doctors.find((d) => d.id === doctorId)!.userId = user.id
}

export const usersHandlers: HttpHandler[] = [
  http.get(url('/admin/users'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['admin.users.view', 'admin.setup.view'])
      const clinicId = requireClinic(ctx)
      const order = { active: 0, invited: 1, inactive: 2 }
      return ctx.db.users
        .filter((u) => u.clinicId === clinicId)
        .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))
        .map((u) => summarise(ctx.db, u))
    }),
  ),

  http.get(url('/admin/users/roles'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['admin.roles.view', 'admin.users.view', 'admin.setup.view'])
      const clinicId = requireClinic(ctx)
      return ctx.db.roles
        .filter((r) => r.clinicId === clinicId && r.active)
        .map(({ id, name, description, templateKey, isSystem }: Role) => ({ id, name, description, templateKey, isSystem }))
    }),
  ),

  http.post(url('/admin/users'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.users.create')
      const data = validate(userInputSchema, raw)
      checkRules(ctx, data)
      const user: User = {
        id: crypto.randomUUID(),
        clinicId: requireClinic(ctx),
        name: data.name,
        username: usernameFrom(data.name, (u) => ctx.db.users.some((x) => x.username === u)),
        mobile: data.mobile,
        email: data.email || undefined,
        designation: data.designation,
        isSuperAdmin: false,
        roleIds: data.roleIds,
        status: 'invited',
        inviteToken: newInviteToken(),
        inviteExpiresAt: new Date(Date.now() + INVITE_VALID_HOURS * 3_600_000).toISOString(),
        createdAt: new Date().toISOString(),
      }
      ctx.db.users.push(user)
      linkDoctor(ctx.db, user, data.doctorId)
      writeAudit(ctx, { action: 'create', entity: 'user', entityId: user.id, summary: `Invited ${user.name} (${summarise(ctx.db, user).roles.map((r) => r.name).join(', ')})` })
      return { ...summarise(ctx.db, user), inviteToken: user.inviteToken! }
    })
  }),

  http.patch(url('/admin/users/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.users.edit')
      const id = params.id as string
      const data = validate(userInputSchema, raw)
      const user = findInClinic(ctx.db.users, ctx, id, 'User')
      checkRules(ctx, data, id)
      const before = summarise(ctx.db, user)
      if (!data.active && user.status !== 'inactive') {
        if (!ctx.permissions.has('admin.users.cancel')) throw new ApiError(403, 'forbidden', 'You do not have permission to deactivate users.')
        if (user.id === ctx.user.id) throw new ApiError(400, 'invalid', 'You cannot deactivate your own login.', { active: 'You cannot deactivate yourself' })
        const adminRoles = new Set(ctx.db.roles.filter((r) => r.clinicId === user.clinicId && r.templateKey === 'admin').map((r) => r.id))
        const otherAdmins = ctx.db.users.filter((u) => u.clinicId === user.clinicId && u.id !== id && u.status === 'active' && u.roleIds.some((r) => adminRoles.has(r)))
        if (user.roleIds.some((r) => adminRoles.has(r)) && otherAdmins.length === 0) {
          throw new ApiError(400, 'invalid', 'The clinic needs at least one active Clinic Admin.', { active: 'Last active Clinic Admin' })
        }
        user.status = 'inactive'
        delete user.inviteToken
        ctx.db.sessions = ctx.db.sessions.filter((s) => s.userId !== id)
      } else if (data.active && user.status === 'inactive') {
        user.status = 'active'
      }
      Object.assign(user, { name: data.name, mobile: data.mobile, email: data.email || undefined, designation: data.designation, roleIds: data.roleIds })
      linkDoctor(ctx.db, user, user.status === 'inactive' ? null : data.doctorId)
      const after = summarise(ctx.db, user)
      writeAudit(ctx, { action: 'edit', entity: 'user', entityId: id, summary: `Edited user ${user.name}`, before, after })
      return after
    })
  }),

  http.patch(url('/admin/users/:id/pin'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.users.edit')
      const id = params.id as string
      const data = validate(overridePinSchema, raw)
      const user = findInClinic(ctx.db.users, ctx, id, 'User')
      if (user.status !== 'active') throw new ApiError(409, 'state', 'Only an active user can have an override PIN.')
      user.pinHash = data.pin ? hashPassword(user.id, data.pin) : undefined
      writeAudit(ctx, { action: 'edit', entity: 'user', entityId: id, summary: data.pin ? `Set an approval PIN for ${user.name}` : `Cleared ${user.name}’s approval PIN` })
    })
  }),

  http.post(url('/admin/users/:id/resend-invite'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.users.edit')
      const id = params.id as string
      const user = findInClinic(ctx.db.users, ctx, id, 'User')
      if (user.status !== 'invited') throw new ApiError(400, 'invalid', 'This user has already accepted their invite.')
      user.inviteToken = newInviteToken()
      user.inviteExpiresAt = new Date(Date.now() + INVITE_VALID_HOURS * 3_600_000).toISOString()
      writeAudit(ctx, { action: 'invite', entity: 'user', entityId: id, summary: `Re-sent invite to ${user.name}` })
      return { inviteToken: user.inviteToken }
    }),
  ),
]
