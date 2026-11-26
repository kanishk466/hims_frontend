/** HTTP-shaped twin of src/api/vitals.ts's old mock logic (Stage 6c-ii). */
import { http, type HttpHandler } from 'msw'
import { bmi } from '@/lib/opd/vitals'
import type { Vitals } from '@/types/opd'
import { vitalsInputSchema } from '@/types/opd'
import { ApiError } from '@/api/client'
import { findInClinic, nowIso, requirePermission, validate, writeAudit } from '@/api/_server'
import { authenticateFromRequest, respond, url } from './common.js'

export const vitalsHandlers: HttpHandler[] = [
  http.get(url('/opd/visits/:visitId/vitals'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.vitals.view', 'opd.workbench.view'])
      const visitId = params.visitId as string
      findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      return ctx.db.vitals.find((v) => v.visitId === visitId) ?? null
    }),
  ),

  http.post(url('/opd/visits/:visitId/vitals'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.vitals.create', 'opd.vitals.edit'])
      const visitId = params.visitId as string
      const data = validate(vitalsInputSchema, raw)
      const visit = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      if (['completed', 'cancelled', 'noShow'].includes(visit.status)) throw new ApiError(409, 'state', 'This visit is closed.')
      const existing = ctx.db.vitals.find((v) => v.visitId === visitId)
      if (existing && !ctx.permissions.has('opd.vitals.edit')) throw new ApiError(403, 'forbidden', 'You can record vitals but not change them.')
      if (!existing && !ctx.permissions.has('opd.vitals.create')) throw new ApiError(403, 'forbidden', 'You cannot record vitals.')
      const row: Vitals = {
        ...data,
        bmi: bmi(data.weightKg, data.heightCm),
        id: existing?.id ?? crypto.randomUUID(),
        clinicId: visit.clinicId,
        visitId,
        recordedBy: ctx.user.id,
        recordedByName: ctx.user.name,
        recordedAt: nowIso(),
      }
      if (existing) Object.assign(existing, row)
      else ctx.db.vitals.push(row)
      if (['checkedIn', 'billed'].includes(visit.status)) {
        visit.status = 'vitalsDone'
        visit.history.push({ at: row.recordedAt, by: ctx.user.name, action: 'Vitals recorded' })
      }
      writeAudit(ctx, { action: existing ? 'edit' : 'create', entity: 'vitals', entityId: row.id, summary: `${existing ? 'Updated' : 'Recorded'} vitals for ${visit.visitNo}` })
      return row
    }, 201)
  }),
]
