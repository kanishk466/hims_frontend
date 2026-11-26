/** HTTP-shaped twin of the old mock logic in src/api/roles.ts (now wired to real HTTP, Stage 6f). */
import { http, type HttpHandler } from 'msw'
import { CLINIC_PERMISSIONS, type Permission } from '@/auth/permissions'
import type { Role, RoleInput } from '@/types/auth'
import { roleInputSchema } from '@/types/auth'
import type { DbShape } from '@/mock/db'
import { ApiError } from '@/api/client'
import { conflict, findInClinic, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { authenticateFromRequest, respond, url } from './common.js'

const isLocked = (r: Role) => r.templateKey === 'admin'

function detail(db: DbShape, r: Role) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    templateKey: r.templateKey,
    isSystem: r.isSystem,
    active: r.active,
    locked: isLocked(r),
    permissions: [...r.permissions].sort(),
    discountLimitPercent: r.discountLimitPercent ?? 0,
    users: db.users
      .filter((u) => u.roleIds.includes(r.id) && u.clinicId === r.clinicId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({ id: u.id, name: u.name, status: u.status })),
  }
}

/** Keep only real clinic permissions, and add "view" for any screen that has another
 *  action ticked (you cannot create on a screen you cannot open). */
function normalisePermissions(codes: string[]): Permission[] {
  const allowed = new Set<string>(CLINIC_PERMISSIONS)
  const out = new Set<Permission>()
  for (const c of codes) {
    if (!allowed.has(c)) continue
    out.add(c as Permission)
    const view = c.replace(/\.[a-z]+$/, '.view')
    if (allowed.has(view)) out.add(view as Permission)
  }
  return [...out].sort()
}

function diff(before: Permission[], after: Permission[]) {
  const b = new Set(before)
  const a = new Set(after)
  return { added: after.filter((p) => !b.has(p)), removed: before.filter((p) => !a.has(p)) }
}

function checkName(ctx: RequestContext, name: string, selfId?: string) {
  const clinicId = requireClinic(ctx)
  if (ctx.db.roles.some((r) => r.clinicId === clinicId && r.id !== selfId && r.name.toLowerCase() === name.toLowerCase())) {
    conflict('name', 'Another role has this name.')
  }
}

export const rolesHandlers: HttpHandler[] = [
  http.get(url('/admin/roles'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.roles.view')
      const clinicId = requireClinic(ctx)
      return ctx.db.roles
        .filter((r) => r.clinicId === clinicId)
        .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.isSystem) - Number(a.isSystem))
        .map((r) => detail(ctx.db, r))
    }),
  ),

  http.post(url('/admin/roles'), async ({ request }) => {
    const raw = await request.json()
    const copyFromId = new URL(request.url).searchParams.get('copyFrom') ?? undefined
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.roles.create')
      const data = validate(roleInputSchema, raw) as RoleInput
      checkName(ctx, data.name)
      const source = copyFromId ? findInClinic(ctx.db.roles, ctx, copyFromId, 'Role') : undefined
      const role: Role = {
        id: crypto.randomUUID(),
        clinicId: requireClinic(ctx),
        name: data.name,
        description: data.description ?? '',
        isSystem: false,
        permissions: normalisePermissions(source ? source.permissions : data.permissions),
        discountLimitPercent: data.discountLimitPercent ?? source?.discountLimitPercent ?? 0,
        active: true,
      }
      ctx.db.roles.push(role)
      writeAudit(ctx, {
        action: 'create',
        entity: 'role',
        entityId: role.id,
        summary: source ? `Created role ${role.name} as a copy of ${source.name}` : `Created role ${role.name}`,
        after: { permissions: role.permissions },
      })
      return detail(ctx.db, role)
    })
  }),

  http.patch(url('/admin/roles/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.roles.edit')
      const id = params.id as string
      const data = validate(roleInputSchema, raw) as RoleInput
      const role = findInClinic(ctx.db.roles, ctx, id, 'Role')
      checkName(ctx, data.name, id)
      const next = normalisePermissions(data.permissions)
      if (isLocked(role)) {
        if (next.length !== CLINIC_PERMISSIONS.length || data.name !== role.name) {
          throw new ApiError(409, 'locked', 'Clinic Admin always has full access, so the clinic cannot lock itself out. Copy it to make a limited admin role.')
        }
      }
      const changes = diff(role.permissions, next)
      const renamed = role.name !== data.name
      const limit = data.discountLimitPercent ?? role.discountLimitPercent ?? 0
      const before = { name: role.name, description: role.description, discountLimitPercent: role.discountLimitPercent }
      Object.assign(role, { name: data.name, description: data.description ?? '', permissions: next, discountLimitPercent: limit })
      const parts = [
        renamed && `renamed from ${before.name}`,
        limit !== before.discountLimitPercent && `discount limit ${before.discountLimitPercent ?? 0}% → ${limit}%`,
        changes.added.length && `${changes.added.length} permission(s) added`,
        changes.removed.length && `${changes.removed.length} removed`,
      ].filter(Boolean)
      // Stage 6f note: unlike the old mock (which used describePermission() for pretty audit
      // text), the backend's audit diff stores raw permission codes — there is no label
      // catalogue server-side. Match that here so the MSW-backed tests see the same shape.
      writeAudit(ctx, {
        action: 'edit',
        entity: 'role',
        entityId: id,
        summary: `Edited role ${role.name}${parts.length ? `: ${parts.join(', ')}` : ''}`,
        before,
        after: { added: changes.added, removed: changes.removed },
      })
      return detail(ctx.db, role)
    })
  }),

  http.patch(url('/admin/roles/:id/active'), async ({ request, params }) => {
    const raw = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, raw.active ? 'admin.roles.edit' : 'admin.roles.cancel')
      const id = params.id as string
      const role = findInClinic(ctx.db.roles, ctx, id, 'Role')
      if (!raw.active) {
        if (role.isSystem) throw new ApiError(409, 'system_role', 'Built-in roles cannot be deactivated. Remove their permissions instead.')
        const holders = ctx.db.users.filter((u) => u.roleIds.includes(id) && u.status !== 'inactive')
        if (holders.length) throw new ApiError(409, 'in_use', `${holders.length} user(s) still have this role. Change their roles first.`)
      }
      role.active = raw.active
      writeAudit(ctx, { action: raw.active ? 'activate' : 'deactivate', entity: 'role', entityId: id, summary: `${raw.active ? 'Reactivated' : 'Deactivated'} role ${role.name}` })
      return detail(ctx.db, role)
    })
  }),
]
