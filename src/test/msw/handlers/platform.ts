/** HTTP-shaped twin of the old mock logic in src/api/platform.ts (now wired to real HTTP, Stage 6f). */
import { http, type HttpHandler } from 'msw'
import type { Clinic, ClinicSummary, CreateClinicInput, UpdateClinicInput } from '@/types/clinic'
import { createClinicSchema, updateClinicSchema } from '@/types/clinic'
import type { DbShape } from '@/mock/db'
import { INVITE_VALID_HOURS, newInviteToken, provisionClinic } from '@/mock/provision'
import { computeSetupProgress } from '@/api/_setup'
import { conflict, notFound, requirePermission, validate, writeAudit } from '@/api/_server'
import { authenticateFromRequest, respond, url } from './common.js'

function summarise(db: DbShape, c: Clinic): ClinicSummary {
  const progress = computeSetupProgress(db, c.id)
  const adminRoleIds = db.roles.filter((r) => r.clinicId === c.id && r.templateKey === 'admin').map((r) => r.id)
  const admin = db.users.find((u) => u.clinicId === c.id && u.roleIds.some((r) => adminRoleIds.includes(r)))
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    city: c.city,
    state: c.state,
    plan: c.plan,
    status: c.status,
    beds: c.beds,
    trialEndsAt: c.trialEndsAt,
    createdAt: c.createdAt,
    setup: { done: progress.requiredDone, required: progress.requiredTotal },
    admin: admin ? { id: admin.id, name: admin.name, status: admin.status, inviteToken: admin.inviteToken } : null,
    counts: {
      users: db.users.filter((u) => u.clinicId === c.id && u.status !== 'inactive').length,
      doctors: db.doctors.filter((d) => d.clinicId === c.id && d.active).length,
    },
  }
}

export const platformHandlers: HttpHandler[] = [
  http.get(url('/platform/clinics'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'platform.clinics.view')
      return [...ctx.db.clinics].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => summarise(ctx.db, c))
    }),
  ),

  http.get(url('/platform/clinics/code-available'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'platform.clinics.create')
      const code = new URL(request.url).searchParams.get('code') ?? ''
      return { available: !ctx.db.clinics.some((c) => c.code === code.trim().toLowerCase()) }
    }),
  ),

  http.post(url('/platform/clinics'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'platform.clinics.create')
      const data = validate(createClinicSchema, raw) as CreateClinicInput
      if (ctx.db.clinics.some((c) => c.code === data.code)) conflict('code', `“${data.code}” is already taken. Try another code.`)
      if (ctx.db.users.some((u) => u.email?.toLowerCase() === data.adminEmail.toLowerCase() && u.status !== 'inactive')) {
        conflict('adminEmail', 'A user with this email already exists.')
      }
      const { clinic, admin, steps } = provisionClinic(ctx.db, data)
      writeAudit(ctx, { action: 'create', entity: 'clinic', entityId: clinic.id, summary: `Created clinic ${clinic.name} (${clinic.code})`, after: clinic })
      writeAudit(ctx, { action: 'invite', entity: 'user', entityId: admin.id, summary: `Invited ${admin.name} as Clinic Admin of ${clinic.name}` })
      return { clinic: summarise(ctx.db, clinic), steps, inviteToken: admin.inviteToken!, inviteExpiresAt: admin.inviteExpiresAt! }
    })
  }),

  http.patch(url('/platform/clinics/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'platform.clinics.edit')
      const id = params.id as string
      const data = validate(updateClinicSchema, raw) as UpdateClinicInput
      const clinic = ctx.db.clinics.find((c) => c.id === id) ?? notFound('Clinic')
      const before = { name: clinic.name, plan: clinic.plan, status: clinic.status, beds: clinic.beds }
      Object.assign(clinic, data)
      if (before.status !== 'suspended' && data.status === 'suspended') {
        const ids = new Set(ctx.db.users.filter((u) => u.clinicId === id).map((u) => u.id))
        ctx.db.sessions = ctx.db.sessions.filter((s) => !ids.has(s.userId))
      }
      writeAudit(ctx, { action: 'edit', entity: 'clinic', entityId: id, summary: `Updated clinic ${clinic.name}`, before, after: data })
      return summarise(ctx.db, clinic)
    })
  }),

  http.post(url('/platform/clinics/:id/resend-invite'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'platform.clinics.edit')
      const clinicId = params.id as string
      const clinic = ctx.db.clinics.find((c) => c.id === clinicId) ?? notFound('Clinic')
      const adminRoleIds = ctx.db.roles.filter((r) => r.clinicId === clinicId && r.templateKey === 'admin').map((r) => r.id)
      const admin = ctx.db.users.find((u) => u.clinicId === clinicId && u.status === 'invited' && u.roleIds.some((r) => adminRoleIds.includes(r)))
      if (!admin) notFound('Pending admin invite')
      admin.inviteToken = newInviteToken()
      admin.inviteExpiresAt = new Date(Date.now() + INVITE_VALID_HOURS * 3_600_000).toISOString()
      writeAudit(ctx, { action: 'invite', entity: 'user', entityId: admin.id, summary: `Re-sent invite to ${admin.name} (${clinic.name})` })
      return { inviteToken: admin.inviteToken, inviteExpiresAt: admin.inviteExpiresAt }
    }),
  ),
]
