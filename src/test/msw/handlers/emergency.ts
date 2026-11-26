/** HTTP-shaped twin of src/api/emergency.ts's old mock logic (Stage 6c-i). */
import { http, type HttpHandler } from 'msw'
import { addDays, todayIST } from '@/lib/dates'
import { sessionsOn } from '@/lib/opd/slots'
import { nextTempUhid, nextToken, nextUhid, nextVisitNo } from '@/mock/numbers'
import { GENDER_LABELS, emergencyInputSchema, patientInputSchema, type Patient, type PatientInput, type Visit } from '@/types/opd'
import { ApiError } from '@/api/client'
import { findInClinic, nowIso, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { brief, nowHHMM, toRow } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

function casualtyDoctors(ctx: RequestContext) {
  const clinicId = requireClinic(ctx)
  const today = todayIST()
  const hhmm = nowHHMM()
  const depts = ctx.db.departments.filter((d) => d.clinicId === clinicId && d.casualty && d.active)
  return ctx.db.doctors
    .filter((d) => d.active && depts.some((x) => x.id === d.departmentId))
    .map((d) => ({
      id: d.id,
      name: d.name,
      departmentName: depts.find((x) => x.id === d.departmentId)!.name,
      onDuty: sessionsOn(ctx.db.schedules, d.id, today).some((s) => s.start <= hhmm && hhmm < s.end),
    }))
}

function tempPatient(ctx: RequestContext, id: string): Patient {
  const p = findInClinic(ctx.db.patients, ctx, id, 'Patient')
  if (!p.temporary || p.mergedIntoId) throw new ApiError(409, 'not_temporary', 'This record is not a temporary emergency registration.')
  return p
}

export const emergencyHandlers: HttpHandler[] = [
  http.get(url('/opd/emergency/context'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.emergency.view')
      const clinicId = requireClinic(ctx)
      const doctors = casualtyDoctors(ctx)
      const today = todayIST()
      const temps = ctx.db.patients.filter((p) => p.clinicId === clinicId && p.temporary && !p.mergedIntoId)
      return {
        doctors,
        defaultDoctorId: (doctors.find((d) => d.onDuty) ?? doctors[0])?.id ?? null,
        toIdentify: temps
          .map((p) => {
            const v = ctx.db.visits.filter((x) => x.patientId === p.id).sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))[0]
            return { ...brief(ctx.db, p), createdAt: p.createdAt, visit: v ? toRow(ctx.db, v) : undefined }
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        today: ctx.db.visits
          .filter((v) => v.clinicId === clinicId && v.emergency && (v.date === today || !['completed', 'cancelled', 'noShow'].includes(v.status)))
          .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
          .map((v) => toRow(ctx.db, v)),
      }
    }),
  ),

  http.post(url('/opd/emergency/register'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.emergency.create')
      const data = validate(emergencyInputSchema, raw)
      const clinicId = requireClinic(ctx)
      const doctor = findInClinic(ctx.db.doctors, ctx, data.doctorId, 'Doctor')
      if (!casualtyDoctors(ctx).some((d) => d.id === doctor.id)) throw new ApiError(400, 'invalid', `${doctor.name} is not a casualty doctor.`, { doctorId: 'Choose a casualty doctor' })
      const today = todayIST()
      const at = nowIso()
      const name = data.name?.trim() || `Unknown ${data.gender === 'O' ? 'person' : GENDER_LABELS[data.gender].toLowerCase()}`
      const patient: Patient = {
        id: crypto.randomUUID(),
        clinicId,
        uhid: nextTempUhid(ctx.db, clinicId, today),
        temporary: true,
        name,
        gender: data.gender,
        dob: addDays(today, -Math.round(data.approxAge * 365.25)),
        dobApprox: true,
        mobile: data.mobile ?? '',
        category: 'general',
        allergies: [],
        chronicConditions: [],
        guardianName: data.broughtBy || undefined,
        createdAt: at,
        updatedAt: at,
      }
      ctx.db.patients.push(patient)
      const tokenNo = nextToken(ctx.db, clinicId, doctor.id, today)
      const visit: Visit = {
        id: crypto.randomUUID(),
        clinicId,
        visitNo: nextVisitNo(ctx.db, clinicId, today),
        patientId: patient.id,
        doctorId: doctor.id,
        departmentId: doctor.departmentId,
        date: today,
        visitType: 'new',
        payerId: 'cash',
        category: 'general',
        tokenNo,
        token: `E${tokenNo}`,
        priority: true,
        emergency: true,
        queueOrder: tokenNo,
        status: 'checkedIn',
        consultPaid: false,
        mlc: data.isMlc ? { policeStation: data.policeStation!, mlcNo: data.mlcNo!, officerName: data.officerName || undefined, recordedAt: at, recordedBy: ctx.user.name } : undefined,
        checkedInAt: at,
        history: [
          { at, by: ctx.user.name, action: `Emergency registration, token E${tokenNo}${data.broughtBy ? `; brought by ${data.broughtBy}` : ''}${data.complaint ? `; ${data.complaint}` : ''}` },
          ...(data.isMlc ? [{ at, by: ctx.user.name, action: `MLC recorded: ${data.mlcNo}, ${data.policeStation}` }] : []),
        ],
      }
      ctx.db.visits.push(visit)
      writeAudit(ctx, { action: 'create', entity: 'visit', entityId: visit.id, summary: `Emergency registration ${patient.uhid}, token E${tokenNo} with ${doctor.name}${visit.mlc ? ` (MLC ${visit.mlc.mlcNo})` : ''}` })
      return toRow(ctx.db, visit)
    }, 201)
  }),

  http.post(url('/opd/emergency/visits/:visitId/mlc'), async ({ request, params }) => {
    const mlc = (await request.json()) as { policeStation: string; mlcNo: string; officerName?: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.emergency.edit')
      const v = findInClinic(ctx.db.visits, ctx, params.visitId as string, 'Visit')
      if (!mlc.policeStation.trim() || !mlc.mlcNo.trim()) {
        throw new ApiError(400, 'invalid', 'Enter the police station and MLC number.', { ...(mlc.policeStation.trim() ? {} : { policeStation: 'Enter the police station' }), ...(mlc.mlcNo.trim() ? {} : { mlcNo: 'Enter the MLC number' }) })
      }
      const before = v.mlc
      const at = nowIso()
      v.mlc = { policeStation: mlc.policeStation.trim(), mlcNo: mlc.mlcNo.trim(), officerName: mlc.officerName?.trim() || undefined, recordedAt: before?.recordedAt ?? at, recordedBy: before?.recordedBy ?? ctx.user.name }
      v.history.push({ at, by: ctx.user.name, action: before ? `MLC details corrected: ${v.mlc.mlcNo}, ${v.mlc.policeStation}` : `MLC recorded: ${v.mlc.mlcNo}, ${v.mlc.policeStation}` })
      writeAudit(ctx, { action: 'edit', entity: 'visit', entityId: v.id, summary: `${before ? 'Corrected' : 'Recorded'} MLC ${v.mlc.mlcNo} on ${v.visitNo}`, before, after: v.mlc })
      return toRow(ctx.db, v)
    }, 201)
  }),

  http.post(url('/opd/emergency/patients/:tempId/merge/:targetId'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.emergency.edit')
      const temp = tempPatient(ctx, params.tempId as string)
      const target = findInClinic(ctx.db.patients, ctx, params.targetId as string, 'Patient')
      if (target.id === temp.id || target.temporary || target.mergedIntoId) throw new ApiError(400, 'invalid', 'Choose the patient’s registered record (not another temporary one).')
      const at = nowIso()
      let moved = 0
      for (const v of ctx.db.visits.filter((x) => x.patientId === temp.id)) {
        v.patientId = target.id
        v.category = target.category
        v.history.push({ at, by: ctx.user.name, action: `Identified as ${target.uhid}; moved from ${temp.uhid}` })
        moved++
      }
      for (const list of [ctx.db.bills, ctx.db.notes, ctx.db.orders, ctx.db.appointments] as { patientId: string }[][]) for (const x of list) if (x.patientId === temp.id) x.patientId = target.id
      temp.mergedIntoId = target.id
      temp.mergedAt = at
      writeAudit(ctx, { action: 'edit', entity: 'patient', entityId: target.id, summary: `Merged emergency record ${temp.uhid} into ${target.uhid} (${moved} visit${moved === 1 ? '' : 's'})` })
      return target
    }, 201),
  ),

  http.post(url('/opd/emergency/patients/:tempId/confirm'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.emergency.edit')
      const temp = tempPatient(ctx, params.tempId as string)
      const data: PatientInput = validate(patientInputSchema, raw)
      const previous = temp.uhid
      const { confirmNotDuplicate: _ignored, ...details } = data
      Object.assign(temp, details, { uhid: nextUhid(ctx.db, temp.clinicId, todayIST()), previousUhid: previous, temporary: false, updatedAt: nowIso() })
      for (const v of ctx.db.visits.filter((x) => x.patientId === temp.id)) v.history.push({ at: nowIso(), by: ctx.user.name, action: `Patient identified; UHID ${temp.uhid} (was ${previous})` })
      writeAudit(ctx, { action: 'edit', entity: 'patient', entityId: temp.id, summary: `Confirmed emergency record ${previous} as ${temp.uhid}` })
      return temp
    }, 201)
  }),
]
