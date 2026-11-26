/** HTTP-shaped twin of src/api/emr.ts's old mock logic (Stage 6c-ii). */
import { http, type HttpHandler } from 'msw'
import { ICD10 } from '@/mock/seed/icd10'
import type { ClinicalNote, NoteContent, Order } from '@/types/opd'
import { EMPTY_NOTE } from '@/types/opd'
import { ApiError } from '@/api/client'
import { findInClinic, nowIso, requireClinic, requirePermission, writeAudit, type RequestContext } from '@/api/_server'
import { label, toRow } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

function noteFor(ctx: RequestContext, visitId: string): ClinicalNote {
  const existing = ctx.db.notes.find((n) => n.visitId === visitId)
  if (existing) return existing
  const v = ctx.db.visits.find((x) => x.id === visitId)!
  return { ...structuredClone(EMPTY_NOTE), id: '', clinicId: v.clinicId, visitId, patientId: v.patientId, doctorId: v.doctorId, addenda: [], updatedAt: '' }
}

/** Order sets per specialty, built from the clinic's services by code. */
function orderSets(ctx: RequestContext) {
  const clinicId = requireClinic(ctx)
  const id = (code: string) => ctx.db.services.find((s) => s.clinicId === clinicId && s.code === code && s.active)?.id
  const set = (key: string, name: string, codes: string[]) => ({ id: key, name, serviceIds: codes.map(id).filter((x): x is string => !!x) })
  return [
    set('fever', 'Fever work-up', ['CBC', 'DENGUE', 'URINE-R']),
    set('diabetes', 'Diabetes review', ['FBS', 'PPBS', 'HBA1C']),
    set('cardiac', 'Cardiac risk', ['LIPID', 'KFT', 'ECG']),
    set('abdomen', 'Abdominal pain', ['CBC', 'LFT', 'USG-ABD']),
  ].filter((s) => s.serviceIds.length)
}

const pickContent = (n: NoteContent): NoteContent => ({
  complaints: n.complaints,
  complaintText: n.complaintText,
  hpi: n.hpi,
  pastHistory: n.pastHistory,
  familyHistory: n.familyHistory,
  personalHistory: n.personalHistory,
  examination: n.examination,
  diagnoses: n.diagnoses,
  advice: n.advice,
  followUpDate: n.followUpDate,
  rx: n.rx,
})

function editable(ctx: RequestContext, visitId: string) {
  const v = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
  if (['cancelled', 'noShow'].includes(v.status)) throw new ApiError(409, 'state', 'This visit is cancelled.')
  const note = ctx.db.notes.find((n) => n.visitId === visitId)
  if (note?.lockedAt) throw new ApiError(409, 'locked', 'The note is locked. Add an addendum instead.')
  return { v, note }
}

export const emrHandlers: HttpHandler[] = [
  http.get(url('/opd/icd10'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.workbench.view')
      const u = new URL(request.url)
      const n = (u.searchParams.get('q') ?? '').trim().toLowerCase()
      if (!n) return []
      return ICD10.filter((c) => c.code.toLowerCase().startsWith(n) || c.name.toLowerCase().includes(n))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(n)) - Number(!b.name.toLowerCase().startsWith(n)))
        .slice(0, 15)
    }),
  ),

  http.get(url('/opd/visits/:visitId/consultation'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.workbench.view')
      const visitId = params.visitId as string
      const v = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      const patient = ctx.db.patients.find((p) => p.id === v.patientId)!
      const past = ctx.db.visits
        .filter((x) => x.patientId === v.patientId && x.id !== v.id && x.status === 'completed')
        .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
      const pastVisits = past.slice(0, 5).map((x) => {
        const n = ctx.db.notes.find((y) => y.visitId === x.id)
        const vt = ctx.db.vitals.find((y) => y.visitId === x.id)
        return {
          visitId: x.id,
          date: x.date,
          doctorName: ctx.db.doctors.find((d) => d.id === x.doctorId)?.name ?? '?',
          visitTypeLabel: label(ctx.db, x.clinicId, 'visitType', x.visitType),
          diagnoses: n?.diagnoses.map((d) => `${d.name} (${d.code})`) ?? [],
          drugs: n?.rx.map((r) => `${r.brand} ${r.frequency} × ${r.duration}${r.durationUnit.toLowerCase()}`) ?? [],
          vitals: vt ? [vt.bpSys && `BP ${vt.bpSys}/${vt.bpDia}`, vt.pulse && `P ${vt.pulse}`, vt.tempF && `T ${vt.tempF}°F`, vt.weightKg && `${vt.weightKg} kg`].filter(Boolean).join(', ') : undefined,
        }
      })
      const lastLocked = past.map((x) => ctx.db.notes.find((n) => n.visitId === x.id && n.lockedAt)).find(Boolean)
      const lastVisit = lastLocked && past.find((x) => x.id === lastLocked.visitId)
      return {
        visit: toRow(ctx.db, v),
        patient,
        note: noteFor(ctx, visitId),
        vitals: ctx.db.vitals.find((x) => x.visitId === visitId) ?? null,
        orders: ctx.db.orders.filter((o) => o.visitId === visitId).sort((a, b) => a.orderedAt.localeCompare(b.orderedAt)),
        pastVisits,
        lastNote: lastLocked
          ? {
              ...pickContent(lastLocked),
              date: lastVisit!.date,
              doctorName: ctx.db.doctors.find((d) => d.id === lastVisit!.doctorId)?.name ?? '?',
            }
          : null,
        templates: ctx.db.rxTemplates.filter((t) => t.clinicId === v.clinicId && (!t.doctorId || t.doctorId === v.doctorId)),
        orderSets: orderSets(ctx),
      }
    }),
  ),

  http.post(url('/opd/visits/:visitId/notes'), async ({ request, params }) => {
    const raw = (await request.json()) as NoteContent
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.workbench.create', 'opd.workbench.edit'])
      const visitId = params.visitId as string
      const { v, note } = editable(ctx, visitId)
      if (raw.followUpDate && raw.followUpDate <= v.date) throw new ApiError(400, 'invalid', 'Follow-up date must be after today.', { followUpDate: 'Pick a later date' })
      const at = nowIso()
      if (note) {
        Object.assign(note, pickContent(raw), { updatedAt: at })
        return note
      }
      const created: ClinicalNote = { ...pickContent(raw), id: crypto.randomUUID(), clinicId: v.clinicId, visitId, patientId: v.patientId, doctorId: v.doctorId, addenda: [], updatedAt: at }
      ctx.db.notes.push(created)
      return created
    }, 201)
  }),

  http.post(url('/opd/visits/:visitId/complete'), async ({ request, params }) => {
    const raw = (await request.json()) as NoteContent
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.workbench.edit')
      const visitId = params.visitId as string
      const { v } = editable(ctx, visitId)
      if (!raw.diagnoses.length) throw new ApiError(400, 'diagnosis', 'Add at least one diagnosis before completing.', { diagnoses: 'Add a diagnosis' })
      if (v.status !== 'inConsultation') throw new ApiError(409, 'state', 'Call the patient in before completing the consultation.')
      const at = nowIso()
      let note = ctx.db.notes.find((n) => n.visitId === visitId)
      if (!note) {
        note = { ...pickContent(raw), id: crypto.randomUUID(), clinicId: v.clinicId, visitId, patientId: v.patientId, doctorId: v.doctorId, addenda: [], updatedAt: at }
        ctx.db.notes.push(note)
      } else Object.assign(note, pickContent(raw), { updatedAt: at })
      note.lockedAt = at
      v.status = 'completed'
      v.completedAt = at
      v.history.push({ at, by: ctx.user.name, action: 'Consultation completed' })
      writeAudit(ctx, { action: 'edit', entity: 'note', entityId: note.id, summary: `Completed consultation ${v.visitNo}: ${note.diagnoses.map((d) => d.code).join(', ')}; ${note.rx.length} drug(s)` })
      return note
    }, 201)
  }),

  http.post(url('/opd/visits/:visitId/notes/addendum'), async ({ request, params }) => {
    const raw = (await request.json()) as { text: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.workbench.edit')
      const visitId = params.visitId as string
      findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      const note = ctx.db.notes.find((n) => n.visitId === visitId)
      if (!note?.lockedAt) throw new ApiError(409, 'not_locked', 'The note is still open: edit it directly.')
      if (!raw.text.trim()) throw new ApiError(400, 'invalid', 'Write the addendum.', { text: 'Write the addendum' })
      note.addenda.push({ text: raw.text.trim(), at: nowIso(), by: ctx.user.id, byName: ctx.user.name })
      writeAudit(ctx, { action: 'edit', entity: 'note', entityId: note.id, summary: 'Added an addendum to a locked note' })
      return note
    }, 201)
  }),

  http.post(url('/opd/visits/:visitId/orders'), async ({ request, params }) => {
    const raw = (await request.json()) as { serviceIds: string[] }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.orders.create')
      const visitId = params.visitId as string
      const v = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      if (['cancelled', 'noShow'].includes(v.status)) throw new ApiError(409, 'state', 'This visit is cancelled.')
      const created: Order[] = []
      for (const sid of [...new Set(raw.serviceIds)]) {
        const s = ctx.db.services.find((x) => x.id === sid && x.clinicId === v.clinicId && x.active)
        if (!s) throw new ApiError(400, 'invalid', 'Unknown service.')
        if (ctx.db.orders.some((o) => o.visitId === visitId && o.serviceId === sid && o.status !== 'cancelled')) continue
        const o: Order = { id: crypto.randomUUID(), clinicId: v.clinicId, visitId, patientId: v.patientId, serviceId: sid, serviceName: s.name, group: s.group, status: 'ordered', orderedBy: ctx.user.id, orderedAt: nowIso() }
        ctx.db.orders.push(o)
        created.push(o)
      }
      if (created.length) writeAudit(ctx, { action: 'create', entity: 'order', entityId: visitId, summary: `Ordered ${created.map((o) => o.serviceName).join(', ')} for ${v.visitNo}` })
      return created
    }, 201)
  }),

  http.post(url('/opd/orders/:orderId/cancel'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.orders.cancel')
      const o = findInClinic(ctx.db.orders, ctx, params.orderId as string, 'Order')
      if (o.status === 'billed') throw new ApiError(409, 'billed', `${o.serviceName} is already billed. Cancel it on the bill instead.`)
      o.status = 'cancelled'
      writeAudit(ctx, { action: 'cancel', entity: 'order', entityId: o.id, summary: `Cancelled order ${o.serviceName}` })
      return undefined
    }),
  ),

  http.post(url('/opd/visits/:visitId/rx-templates'), async ({ request, params }) => {
    const raw = (await request.json()) as { name: string; shared?: boolean } & Pick<NoteContent, 'complaints' | 'diagnoses' | 'rx' | 'advice'>
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.prescription.create')
      const visitId = params.visitId as string
      const v = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      if (!raw.name.trim()) throw new ApiError(400, 'invalid', 'Name the template.', { name: 'Name the template' })
      if (!raw.rx.length) throw new ApiError(400, 'invalid', 'Add drugs before saving a template.')
      const t = { id: crypto.randomUUID(), clinicId: v.clinicId, name: raw.name.trim(), doctorId: raw.shared ? null : v.doctorId, complaints: raw.complaints, diagnoses: raw.diagnoses, rx: raw.rx, advice: raw.advice }
      ctx.db.rxTemplates.push(t)
      return t
    }, 201)
  }),

  http.get(url('/opd/visits/:visitId/prescription-view'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.prescription.view', 'opd.prescription.print', 'opd.workbench.view'])
      const visitId = params.visitId as string
      const v = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      const c = ctx.db.clinics.find((x) => x.id === v.clinicId)!
      const d = ctx.db.doctors.find((x) => x.id === v.doctorId)!
      const note = ctx.db.notes.find((n) => n.visitId === visitId)
      if (!note) throw new ApiError(404, 'not_found', 'No prescription has been written for this visit yet.')
      const map = (type: string) => Object.fromEntries(ctx.db.valueListItems.filter((x) => x.clinicId === v.clinicId && x.type === type).map((x) => [x.code, x.label]))
      return {
        clinic: { name: c.name, legalName: c.legalName, addressLine: c.addressLine, city: c.city, pinCode: c.pinCode, phone: c.phone, email: c.email, logoDataUrl: c.logoDataUrl, registrationNo: c.registrationNo },
        doctor: { name: d.name, qualification: d.qualification, registrationNo: d.registrationNo, council: d.council, departmentName: ctx.db.departments.find((x) => x.id === d.departmentId)?.name ?? '' },
        patient: ctx.db.patients.find((p) => p.id === v.patientId)!,
        visit: toRow(ctx.db, v),
        note,
        vitals: ctx.db.vitals.find((x) => x.visitId === visitId) ?? null,
        orders: ctx.db.orders.filter((o) => o.visitId === visitId && o.status !== 'cancelled'),
        labels: { frequency: map('frequency'), timing: map('timing'), route: map('route') },
        printedAt: nowIso(),
      }
    }),
  ),
]
