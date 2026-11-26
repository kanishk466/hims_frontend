/** HTTP-shaped twin of src/api/visits.ts's old mock logic (Stage 6c-ii). */
import { http, type HttpHandler } from 'msw'
import { todayIST } from '@/lib/dates'
import { splitLines } from '@/lib/opd/billSplit'
import { sessionsOn } from '@/lib/opd/slots'
import { suggestVisitType } from '@/lib/opd/visitType'
import { nextToken, nextVisitNo } from '@/mock/numbers'
import type { Visit, VisitStatus } from '@/types/opd'
import { checkInInputSchema, referralInputSchema } from '@/types/opd'
import { ApiError } from '@/api/client'
import { findInClinic, nowIso, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { consultServiceOf, housekeeping, label, priceFor, settingsOf, toRow } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

const VIEW = ['opd.checkin.view', 'opd.queue.view', 'opd.billing.view', 'opd.vitals.view', 'opd.workbench.view'] as const

function visitTypeRule(ctx: RequestContext) {
  const clinicId = requireClinic(ctx)
  const validity = (code: string, fallback: number) =>
    Number(ctx.db.valueListItems.find((v) => v.clinicId === clinicId && v.type === 'visitType' && v.code === code)?.meta.validityDays ?? fallback)
  return { freeDays: validity('freeFollowUp', 7), followUpDays: validity('followUp', 30), freeAllowed: settingsOf(ctx.db, clinicId).freeFollowUpsAllowed }
}

/** Queue order: in consultation first, then priority tokens, then queue order. */
const queueSort = (a: Visit, b: Visit) => {
  const rank = (v: Visit) => (v.status === 'inConsultation' ? 0 : ['completed', 'cancelled', 'noShow'].includes(v.status) ? 2 : 1)
  return rank(a) - rank(b) || Number(b.priority) - Number(a.priority) || a.queueOrder - b.queueOrder
}

function canCall(ctx: RequestContext, v: Visit) {
  const s = settingsOf(ctx.db, v.clinicId)
  // Emergency patients are treated first and billed later (OPD-14).
  if (v.emergency) return
  if (s.paymentTiming === 'before' && !v.consultPaid && !v.waiveConsultation) {
    throw new ApiError(409, 'not_billed', `Token ${v.token} has not paid the consultation fee yet. Send the patient to billing first.`)
  }
  if (s.vitalsMandatory && !ctx.db.vitals.some((x) => x.visitId === v.id)) {
    throw new ApiError(409, 'no_vitals', `Record vitals for token ${v.token} first.`)
  }
}

function setStatus(ctx: RequestContext, v: Visit, status: VisitStatus, action: string) {
  v.status = status
  v.history.push({ at: nowIso(), by: ctx.user.name, action })
}

export const visitsHandlers: HttpHandler[] = [
  http.get(url('/opd/checkin/preview'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.checkin.view')
      const u = new URL(request.url)
      const patientId = u.searchParams.get('patientId')!
      const doctorId = u.searchParams.get('doctorId')!
      const payerId = u.searchParams.get('payerId')!
      const category = u.searchParams.get('category')!
      const visitType = u.searchParams.get('visitType') ?? undefined
      const clinicId = requireClinic(ctx)
      const today = todayIST()
      findInClinic(ctx.db.patients, ctx, patientId, 'Patient')
      const doctor = findInClinic(ctx.db.doctors, ctx, doctorId, 'Doctor')
      const history = ctx.db.visits.filter((v) => v.clinicId === clinicId && v.patientId === patientId)
      const s = suggestVisitType(history, doctorId, today, visitTypeRule(ctx))
      const last = s.lastPaidDate ? history.find((v) => v.date === s.lastPaidDate && v.doctorId === doctorId) : undefined
      const vt = visitType ?? s.visitType
      const price = priceFor(ctx.db, { clinicId, doctorId, visitType: vt, payerId, category, date: today }, consultServiceOf(clinicId))
      const panel = payerId !== 'cash' ? ctx.db.panels.find((p) => p.id === payerId) ?? null : null
      const [split] = splitLines([{ amountPaise: price.amountPaise, group: 'consultation' }], panel)
      const leave = ctx.db.leaves.find((l) => l.clinicId === clinicId && l.active && (l.doctorId === doctorId || !l.doctorId) && l.from <= today && l.to >= today)
      return {
        visitType: s.visitType,
        reason: s.reason,
        lastVisit: last && { date: last.date, doctorName: doctor.name, visitType: label(ctx.db, clinicId, 'visitType', last.visitType) },
        feePaise: price.amountPaise,
        patientPaysPaise: split!.patientPaise,
        panelPaysPaise: split!.panelPaise,
        priceNote: price.explanation,
        alreadyToday: history.some((v) => v.date === today && v.doctorId === doctorId && !['cancelled', 'noShow'].includes(v.status)),
        onLeave: leave ? leave.reason : null,
        hasSessionToday: sessionsOn(ctx.db.schedules, doctorId, today).length > 0,
        panelNeeds: { documents: panel?.requirements.documents ?? [], priorApproval: panel?.requirements.priorApproval ?? false },
      }
    }),
  ),

  http.post(url('/opd/checkin'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.checkin.create')
      const data = validate(checkInInputSchema, raw)
      const clinicId = requireClinic(ctx)
      const today = todayIST()
      findInClinic(ctx.db.patients, ctx, data.patientId, 'Patient')
      const doctor = findInClinic(ctx.db.doctors, ctx, data.doctorId, 'Doctor')
      if (!doctor.active) throw new ApiError(400, 'invalid', `${doctor.name} is inactive.`)
      if (data.payerId !== 'cash') {
        const panel = ctx.db.panels.find((p) => p.id === data.payerId && p.clinicId === clinicId && p.active)
        if (!panel) throw new ApiError(400, 'invalid', 'Choose an active payer.', { payerId: 'Choose an active payer' })
        if (panel.contract.validTo < today) throw new ApiError(409, 'contract_expired', `${panel.name}'s contract ended on ${panel.contract.validTo}. Bill as cash or renew the contract.`, { payerId: 'Contract expired' })
        const missing = panel.requirements.documents.filter((d) => !data.panelDocuments?.includes(d))
        if (missing.length) throw new ApiError(400, 'documents', `Check the panel documents: ${missing.join(', ')}.`, { panelDocuments: `Still needed: ${missing.join(', ')}` })
        if (panel.requirements.priorApproval && !data.panelApprovalNo) throw new ApiError(400, 'approval', `${panel.name} needs a prior-approval number.`, { panelApprovalNo: 'Enter the approval number' })
      }
      const dup = ctx.db.visits.find((v) => v.clinicId === clinicId && v.patientId === data.patientId && v.doctorId === data.doctorId && v.date === today && !['cancelled', 'noShow', 'completed'].includes(v.status))
      if (dup) throw new ApiError(409, 'already_checked_in', `Already checked in with ${doctor.name} today (token ${dup.token}).`)

      let priority = false
      if (data.appointmentId) {
        const a = findInClinic(ctx.db.appointments, ctx, data.appointmentId, 'Appointment')
        if (a.status !== 'booked' || a.patientId !== data.patientId) throw new ApiError(409, 'appointment', 'This appointment cannot be checked in.')
        priority = settingsOf(ctx.db, clinicId).appointmentPriority
      }
      const at = nowIso()
      const token = nextToken(ctx.db, clinicId, data.doctorId, today)
      // A check-in to a casualty doctor is an emergency visit: E-token, seen before paying.
      const emergency = !!ctx.db.departments.find((d) => d.id === doctor.departmentId)?.casualty
      const visit: Visit = {
        id: crypto.randomUUID(),
        clinicId,
        visitNo: nextVisitNo(ctx.db, clinicId, today),
        patientId: data.patientId,
        doctorId: data.doctorId,
        departmentId: doctor.departmentId,
        date: today,
        visitType: data.visitType,
        payerId: data.payerId,
        category: data.category,
        tokenNo: token,
        token: emergency ? `E${token}` : String(token),
        priority: priority || emergency,
        emergency: emergency || undefined,
        queueOrder: token,
        status: 'checkedIn',
        consultPaid: false,
        appointmentId: data.appointmentId,
        panelApprovalNo: data.panelApprovalNo || undefined,
        panelDocuments: data.panelDocuments,
        referredFromVisitId: data.referredFromVisitId,
        waiveConsultation: data.waiveConsultation,
        checkedInAt: at,
        history: [{ at, by: ctx.user.name, action: `Checked in, token ${token}` }],
      }
      ctx.db.visits.push(visit)
      if (data.appointmentId) {
        const a = ctx.db.appointments.find((x) => x.id === data.appointmentId)!
        a.status = 'arrived'
        a.visitId = visit.id
        a.history.push({ at, by: ctx.user.name, action: `Arrived, token ${token}` })
      }
      writeAudit(ctx, { action: 'create', entity: 'visit', entityId: visit.id, summary: `Checked in ${visit.visitNo} with ${doctor.name}, token ${token}` })
      return toRow(ctx.db, visit)
    }, 201)
  }),

  http.get(url('/opd/visits/tv-board'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.tvDisplay.view')
      const clinicId = requireClinic(ctx)
      const today = todayIST()
      const visits = ctx.db.visits.filter((v) => v.clinicId === clinicId && v.date === today)
      const doctorIds = [...new Set(visits.map((v) => v.doctorId))]
      const doctors = doctorIds.map((id) => {
        const d = ctx.db.doctors.find((x) => x.id === id)!
        const dept = ctx.db.departments.find((x) => x.id === d.departmentId)
        const mine = visits.filter((v) => v.doctorId === id).sort(queueSort)
        const waiting = mine.filter((v) => ['checkedIn', 'billed', 'vitalsDone'].includes(v.status))
        return {
          doctorId: id,
          doctorName: d.name,
          departmentName: dept?.name ?? '',
          color: dept?.queueColor ?? 'teal',
          room: sessionsOn(ctx.db.schedules, id, today)[0]?.room,
          nowServing: mine.find((v) => v.status === 'inConsultation')?.token ?? null,
          next: waiting.slice(0, 3).map((v) => v.token),
          waiting: waiting.length,
        }
      })
      return { clinicName: ctx.db.clinics.find((c) => c.id === clinicId)!.name, doctors: doctors.sort((a, b) => a.doctorName.localeCompare(b.doctorName)) }
    }),
  ),

  http.post(url('/opd/visits/call-next'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.queue.edit')
      const u = new URL(request.url)
      const doctorId = u.searchParams.get('doctorId')!
      const today = todayIST()
      const waiting = ctx.db.visits.filter((v) => v.clinicId === ctx.clinicId && v.doctorId === doctorId && v.date === today && ['checkedIn', 'billed', 'vitalsDone'].includes(v.status)).sort(queueSort)
      const busy = ctx.db.visits.find((x) => x.doctorId === doctorId && x.date === today && x.status === 'inConsultation')
      if (busy) throw new ApiError(409, 'busy', `Token ${busy.token} is still in consultation.`)
      const next = waiting.find((v) => {
        try {
          canCall(ctx, v)
          return true
        } catch {
          return false
        }
      })
      if (!next) {
        if (waiting.length) throw new ApiError(409, 'none_ready', `${waiting.length} waiting, but none has paid yet.`)
        return null
      }
      next.calledAt = nowIso()
      setStatus(ctx, next, 'inConsultation', 'Called in')
      return toRow(ctx.db, next)
    }, 201),
  ),

  http.get(url('/opd/visits'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, [...VIEW])
      housekeeping(ctx)
      const clinicId = requireClinic(ctx)
      const u = new URL(request.url)
      const date = u.searchParams.get('date') ?? todayIST()
      const doctorId = u.searchParams.get('doctorId') ?? undefined
      const status = (u.searchParams.get('status') as VisitStatus | 'open' | null) ?? undefined
      const text = u.searchParams.get('q')?.trim().toLowerCase()
      return ctx.db.visits
        .filter((v) => v.clinicId === clinicId && v.date === date && (!doctorId || v.doctorId === doctorId))
        .filter((v) => !status || (status === 'open' ? !['completed', 'cancelled', 'noShow'].includes(v.status) : v.status === status))
        .sort(queueSort)
        .map((v) => toRow(ctx.db, v))
        .filter((r) => !text || r.patient.name.toLowerCase().includes(text) || r.patient.uhid.toLowerCase().includes(text) || r.token.toLowerCase() === text || r.patient.mobile.includes(text))
    }),
  ),

  http.get(url('/opd/visits/:id'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, [...VIEW])
      return toRow(ctx.db, findInClinic(ctx.db.visits, ctx, params.id as string, 'Visit'))
    }),
  ),

  http.post(url('/opd/visits/:id/call'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.queue.edit')
      const id = params.id as string
      const v = findInClinic(ctx.db.visits, ctx, id, 'Visit')
      if (['completed', 'cancelled', 'noShow', 'inConsultation'].includes(v.status)) throw new ApiError(409, 'state', `Token ${v.token} is ${v.status === 'inConsultation' ? 'already in consultation' : 'closed'}.`)
      const busy = ctx.db.visits.find((x) => x.doctorId === v.doctorId && x.date === v.date && x.status === 'inConsultation' && x.id !== id)
      if (busy) throw new ApiError(409, 'busy', `Token ${busy.token} is still in consultation. Complete or send it back first.`)
      canCall(ctx, v)
      v.calledAt = nowIso()
      setStatus(ctx, v, 'inConsultation', 'Called in')
      return toRow(ctx.db, v)
    }, 201),
  ),

  http.post(url('/opd/visits/:id/skip'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.queue.edit')
      const v = findInClinic(ctx.db.visits, ctx, params.id as string, 'Visit')
      const max = Math.max(...ctx.db.visits.filter((x) => x.doctorId === v.doctorId && x.date === v.date).map((x) => x.queueOrder))
      v.queueOrder = max + 1
      const back = v.status === 'inConsultation'
      if (back) setStatus(ctx, v, v.consultPaid ? 'billed' : 'checkedIn', 'Skipped: sent to the end of the queue')
      else v.history.push({ at: nowIso(), by: ctx.user.name, action: 'Skipped: moved to the end of the queue' })
      v.priority = false
      return undefined
    }),
  ),

  http.post(url('/opd/visits/:id/recall'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.queue.edit')
      const v = findInClinic(ctx.db.visits, ctx, params.id as string, 'Visit')
      const min = Math.min(...ctx.db.visits.filter((x) => x.doctorId === v.doctorId && x.date === v.date).map((x) => x.queueOrder))
      v.queueOrder = min - 1
      v.history.push({ at: nowIso(), by: ctx.user.name, action: 'Recalled to the front of the queue' })
      return undefined
    }),
  ),

  http.post(url('/opd/visits/:id/transfer'), async ({ request, params }) => {
    const raw = (await request.json()) as { doctorId: string; reason: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.queue.edit')
      const v = findInClinic(ctx.db.visits, ctx, params.id as string, 'Visit')
      if (!raw.reason.trim()) throw new ApiError(400, 'invalid', 'Enter a reason.', { reason: 'Enter a reason' })
      if (['completed', 'cancelled', 'noShow'].includes(v.status)) throw new ApiError(409, 'state', 'This visit is closed.')
      const to = findInClinic(ctx.db.doctors, ctx, raw.doctorId, 'Doctor')
      if (to.id === v.doctorId) throw new ApiError(400, 'invalid', 'Choose another doctor.', { doctorId: 'Choose another doctor' })
      const from = ctx.db.doctors.find((d) => d.id === v.doctorId)!
      v.doctorId = to.id
      v.departmentId = to.departmentId
      v.tokenNo = nextToken(ctx.db, v.clinicId, to.id, v.date)
      v.token = v.emergency ? `E${v.tokenNo}` : String(v.tokenNo)
      v.queueOrder = v.tokenNo
      if (v.status === 'inConsultation') v.status = v.consultPaid ? 'billed' : 'checkedIn'
      v.history.push({ at: nowIso(), by: ctx.user.name, action: `Moved from ${from.name} to ${to.name}, new token ${v.token}: ${raw.reason.trim()}` })
      writeAudit(ctx, { action: 'edit', entity: 'visit', entityId: v.id, summary: `Moved ${v.visitNo} from ${from.name} to ${to.name}: ${raw.reason.trim()}` })
      return toRow(ctx.db, v)
    }, 201)
  }),

  http.post(url('/opd/visits/:id/refer'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.workbench.edit', 'opd.checkin.create'])
      const data = validate(referralInputSchema, raw)
      const clinicId = requireClinic(ctx)
      const v = findInClinic(ctx.db.visits, ctx, params.id as string, 'Visit')
      const to = ctx.db.doctors.find((d) => d.id === data.toDoctorId && d.clinicId === clinicId && d.active)
      if (!to) throw new ApiError(400, 'invalid', 'Choose an active doctor.', { toDoctorId: 'Choose an active doctor' })
      if (to.id === v.doctorId) throw new ApiError(400, 'invalid', 'Choose a different doctor to refer to.', { toDoctorId: 'Choose a different doctor' })
      const today = todayIST()
      const dup = ctx.db.visits.find((x) => x.clinicId === clinicId && x.patientId === v.patientId && x.doctorId === to.id && x.date === today && !['cancelled', 'noShow'].includes(x.status))
      if (dup) throw new ApiError(409, 'already_checked_in', `Already has a visit with ${to.name} today (token ${dup.token}).`)
      const from = ctx.db.doctors.find((d) => d.id === v.doctorId)!
      const at = nowIso()
      const token = nextToken(ctx.db, clinicId, to.id, today)
      const emergency = !!ctx.db.departments.find((d) => d.id === to.departmentId)?.casualty
      const note = data.note?.trim()
      const referred: Visit = {
        id: crypto.randomUUID(),
        clinicId,
        visitNo: nextVisitNo(ctx.db, clinicId, today),
        patientId: v.patientId,
        doctorId: to.id,
        departmentId: to.departmentId,
        date: today,
        visitType: 'referral',
        payerId: v.payerId,
        category: v.category,
        tokenNo: token,
        token: emergency ? `E${token}` : String(token),
        priority: emergency,
        emergency: emergency || undefined,
        queueOrder: token,
        status: 'checkedIn',
        consultPaid: false,
        referredFromVisitId: v.id,
        waiveConsultation: true,
        checkedInAt: at,
        history: [{ at, by: ctx.user.name, action: `Referred here from ${v.visitNo} (token ${v.token}, ${from.name})${note ? `: ${note}` : ''}` }],
      }
      ctx.db.visits.push(referred)
      v.history.push({ at, by: ctx.user.name, action: `Referred to ${to.name}, new token ${referred.token}${note ? `: ${note}` : ''}` })
      writeAudit(ctx, { action: 'create', entity: 'visit', entityId: referred.id, summary: `Referred ${v.visitNo} (${from.name}) to ${to.name}, new visit ${referred.visitNo}` })
      return toRow(ctx.db, referred)
    }, 201)
  }),

  http.post(url('/opd/visits/:id/no-show'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.queue.edit')
      const v = findInClinic(ctx.db.visits, ctx, params.id as string, 'Visit')
      if (v.consultPaid) throw new ApiError(409, 'paid', 'This patient has paid. Cancel the bill first, or keep the token.')
      if (v.mlc) throw new ApiError(409, 'mlc', `This is a medico-legal case (MLC ${v.mlc.mlcNo}). MLC visits cannot be marked no-show.`)
      setStatus(ctx, v, 'noShow', 'Marked no-show')
      return undefined
    }),
  ),

  http.post(url('/opd/visits/:id/cancel'), async ({ request, params }) => {
    const raw = (await request.json()) as { reason: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.checkin.cancel')
      const v = findInClinic(ctx.db.visits, ctx, params.id as string, 'Visit')
      if (!raw.reason.trim()) throw new ApiError(400, 'invalid', 'Enter a reason.', { reason: 'Enter a reason' })
      if (ctx.db.bills.some((b) => b.visitId === v.id && b.status !== 'cancelled')) throw new ApiError(409, 'billed', 'This visit has a bill. Cancel the bill first.')
      if (['completed', 'cancelled'].includes(v.status)) throw new ApiError(409, 'state', 'This visit is closed.')
      if (v.mlc) throw new ApiError(409, 'mlc', `This is a medico-legal case (MLC ${v.mlc.mlcNo}). MLC visits cannot be cancelled.`)
      v.cancelReason = raw.reason.trim()
      setStatus(ctx, v, 'cancelled', `Cancelled: ${raw.reason.trim()}`)
      writeAudit(ctx, { action: 'cancel', entity: 'visit', entityId: v.id, summary: `Cancelled visit ${v.visitNo}: ${raw.reason.trim()}` })
      return undefined
    })
  }),
]
