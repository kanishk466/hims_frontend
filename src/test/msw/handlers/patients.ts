/** HTTP-shaped twin of src/api/patients.ts's old mock logic (Stage 6c-i). */
import { http, type HttpHandler } from 'msw'
import { todayIST } from '@/lib/dates'
import { nextUhid } from '@/mock/numbers'
import type { Patient, PatientBrief, PatientInput, VisitRow } from '@/types/opd'
import { patientInputSchema } from '@/types/opd'
import { ApiError } from '@/api/client'
import { findInClinic, nowIso, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { brief, toRow } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

const SEARCH_PERMS = ['opd.registration.view', 'opd.checkin.view', 'opd.appointments.view', 'opd.billing.view', 'opd.queue.view', 'opd.vitals.view'] as const

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function possibleDuplicates(ctx: RequestContext, data: PatientInput, selfId?: string): PatientBrief[] {
  const clinicId = requireClinic(ctx)
  const first = norm(data.name.split(/\s+/)[0] ?? '')
  const year = Number(data.dob.slice(0, 4))
  return ctx.db.patients
    .filter(
      (p) =>
        p.clinicId === clinicId &&
        p.id !== selfId &&
        p.mobile === data.mobile &&
        (norm(p.name) === norm(data.name) || norm(p.name.split(/\s+/)[0] ?? '') === first) &&
        Math.abs(Number(p.dob.slice(0, 4)) - year) <= 1,
    )
    .map((p) => brief(ctx.db, p))
}

const clean = (d: PatientInput) => {
  const { confirmNotDuplicate: _c, ...rest } = d
  return { ...rest, name: rest.name.replace(/\s+/g, ' ').trim() }
}

export const patientsHandlers: HttpHandler[] = [
  http.get(url('/opd/patients'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, [...SEARCH_PERMS])
      const clinicId = requireClinic(ctx)
      const u = new URL(request.url)
      const q = (u.searchParams.get('q') ?? '').trim()
      const limit = Number(u.searchParams.get('limit') ?? '20')
      const mine = ctx.db.patients.filter((p) => p.clinicId === clinicId && !p.mergedIntoId)
      let rows: Patient[]
      if (!q) rows = mine
      else {
        const digits = q.replace(/\D/g, '')
        const n = norm(q)
        rows = mine.filter(
          (p) =>
            norm(p.uhid).includes(n) ||
            (digits.length >= 4 && (p.mobile.includes(digits) || p.altMobile?.includes(digits) || p.abhaNumber?.replace(/\D/g, '').includes(digits))) ||
            p.name.toLowerCase().includes(q.toLowerCase()),
        )
      }
      return rows
        .map((p) => brief(ctx.db, p))
        .sort((a, b) => (b.lastVisitDate ?? '').localeCompare(a.lastVisitDate ?? '') || a.name.localeCompare(b.name))
        .slice(0, limit)
    }),
  ),

  http.get(url('/opd/patients/:id'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, [...SEARCH_PERMS, 'opd.workbench.view'])
      const p = findInClinic(ctx.db.patients, ctx, params.id as string, 'Patient')
      const visits: VisitRow[] = ctx.db.visits
        .filter((v) => v.patientId === p.id)
        .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
        .map((v) => toRow(ctx.db, v))
      return { ...p, visits }
    }),
  ),

  http.post(url('/opd/patients'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.registration.create')
      const data = validate(patientInputSchema, raw)
      const dups = possibleDuplicates(ctx, data)
      if (dups.length && !data.confirmNotDuplicate) {
        throw new ApiError(409, 'possible_duplicate', `${dups.length} patient${dups.length > 1 ? 's' : ''} with this mobile, a similar name and age already exist.`, undefined, dups)
      }
      const clinicId = requireClinic(ctx)
      const at = nowIso()
      const patient: Patient = { ...clean(data), id: crypto.randomUUID(), clinicId, uhid: nextUhid(ctx.db, clinicId, todayIST()), createdAt: at, updatedAt: at }
      ctx.db.patients.push(patient)
      writeAudit(ctx, { action: 'create', entity: 'patient', entityId: patient.id, summary: `Registered patient ${patient.uhid}${dups.length ? ' (confirmed not a duplicate)' : ''}` })
      return patient
    }, 201)
  }),

  http.patch(url('/opd/patients/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.registration.edit')
      const data = validate(patientInputSchema, raw)
      const p = findInClinic(ctx.db.patients, ctx, params.id as string, 'Patient')
      const before = { ...p }
      if (data.abhaNumber !== p.abhaNumber) delete p.abhaVerifiedAt
      Object.assign(p, clean(data), { updatedAt: nowIso() })
      const changed = Object.keys(clean(data)).filter((k) => JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify((p as unknown as Record<string, unknown>)[k]))
      writeAudit(ctx, { action: 'edit', entity: 'patient', entityId: p.id, summary: `Edited patient ${p.uhid}: ${changed.join(', ') || 'no changes'}`, before, after: p })
      return p
    })
  }),

  http.post(url('/opd/patients/:id/verify-abha'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.registration.edit')
      const clinicId = requireClinic(ctx)
      const clinic = ctx.db.clinics.find((c) => c.id === clinicId)!
      if (!clinic.integrations.abdmEnabled) throw new ApiError(409, 'disabled', 'Turn on ABDM / ABHA in Clinic setup → Integrations first.')
      const p = findInClinic(ctx.db.patients, ctx, params.id as string, 'Patient')
      if (!p.abhaNumber) throw new ApiError(400, 'invalid', 'Add an ABHA number first.', { abhaNumber: 'Add an ABHA number' })
      p.abhaVerifiedAt = nowIso()
      writeAudit(ctx, { action: 'edit', entity: 'patient', entityId: p.id, summary: `Verified ABHA ${p.abhaNumber} for patient ${p.uhid} (simulated)` })
      return p
    }),
  ),
]
