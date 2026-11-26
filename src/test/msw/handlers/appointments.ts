/** HTTP-shaped twin of src/api/appointments.ts's old mock logic (Stage 6c-i). */
import { http, type HttpHandler } from 'msw'
import { todayIST } from '@/lib/dates'
import { sessionsOn, slotTimes } from '@/lib/opd/slots'
import type { Appointment, AppointmentInput, DaySlots } from '@/types/opd'
import { appointmentInputSchema } from '@/types/opd'
import { ApiError } from '@/api/client'
import { findInClinic, nowIso, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { brief, housekeeping, nowHHMM } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

function leaveOn(ctx: RequestContext, doctorId: string, date: string): string | null {
  const clinicId = requireClinic(ctx)
  const l = ctx.db.leaves.find((x) => x.clinicId === clinicId && x.active && (x.doctorId === doctorId || x.doctorId === null) && x.from <= date && x.to >= date)
  return l ? (l.doctorId ? `On leave: ${l.reason}` : `Hospital holiday: ${l.reason}`) : null
}

function buildDay(ctx: RequestContext, doctorId: string, date: string): DaySlots {
  const clinicId = requireClinic(ctx)
  const today = todayIST()
  const hhmm = nowHHMM()
  const appts = ctx.db.appointments.filter((a) => a.clinicId === clinicId && a.doctorId === doctorId && a.date === date && a.status !== 'cancelled')
  return {
    doctorId,
    date,
    onLeave: leaveOn(ctx, doctorId, date),
    sessions: sessionsOn(ctx.db.schedules, doctorId, date).map((s) => {
      const slots = slotTimes(s).map((time) => {
        const a = appts.find((x) => x.slot === time)
        const patient = a ? ctx.db.patients.find((p) => p.id === a.patientId) : undefined
        return {
          time,
          scheduleId: s.id,
          room: s.room,
          appointment: a && patient ? { ...a, patient: brief(ctx.db, patient) } : undefined,
          past: date < today || (date === today && time < hhmm),
        }
      })
      return { scheduleId: s.id, start: s.start, end: s.end, room: s.room, maxPatients: s.maxPatients, walkInQuota: s.walkInQuota, booked: slots.filter((x) => x.appointment).length, slots }
    }),
  }
}

function checkSlot(ctx: RequestContext, data: AppointmentInput, selfId?: string) {
  const clinicId = requireClinic(ctx)
  findInClinic(ctx.db.patients, ctx, data.patientId, 'Patient')
  const doctor = findInClinic(ctx.db.doctors, ctx, data.doctorId, 'Doctor')
  if (!doctor.active) throw new ApiError(400, 'invalid', `${doctor.name} is inactive.`)
  const leave = leaveOn(ctx, data.doctorId, data.date)
  if (leave) throw new ApiError(409, 'on_leave', `${doctor.name}: ${leave}.`)
  const day = buildDay(ctx, data.doctorId, data.date)
  const slot = day.sessions.flatMap((s) => s.slots).find((s) => s.time === data.slot)
  if (!slot) throw new ApiError(400, 'no_slot', `${doctor.name} has no OPD slot at ${data.slot} on that day.`)
  if (slot.past) throw new ApiError(400, 'past', 'That time has already passed.')
  if (slot.appointment && slot.appointment.id !== selfId) throw new ApiError(409, 'taken', 'That slot was just booked by someone else. Pick another.')
  const same = ctx.db.appointments.find(
    (a) => a.clinicId === clinicId && a.id !== selfId && a.patientId === data.patientId && a.doctorId === data.doctorId && a.date === data.date && a.status === 'booked',
  )
  if (same) throw new ApiError(409, 'already_booked', `This patient already has a ${same.slot} appointment with ${doctor.name} that day.`)
}

export const appointmentsHandlers: HttpHandler[] = [
  http.get(url('/opd/appointments/slots'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.appointments.view')
      housekeeping(ctx)
      const u = new URL(request.url)
      const doctorId = u.searchParams.get('doctorId')!
      const date = u.searchParams.get('date')!
      findInClinic(ctx.db.doctors, ctx, doctorId, 'Doctor')
      return buildDay(ctx, doctorId, date)
    }),
  ),

  http.get(url('/opd/appointments'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.appointments.view', 'opd.checkin.view'])
      housekeeping(ctx)
      const clinicId = requireClinic(ctx)
      const u = new URL(request.url)
      const date = u.searchParams.get('date')!
      const doctorId = u.searchParams.get('doctorId') ?? undefined
      return ctx.db.appointments
        .filter((a) => a.clinicId === clinicId && a.date === date && (!doctorId || a.doctorId === doctorId))
        .sort((a, b) => a.slot.localeCompare(b.slot))
        .map((a) => ({ ...a, patient: brief(ctx.db, ctx.db.patients.find((p) => p.id === a.patientId)!), doctorName: ctx.db.doctors.find((d) => d.id === a.doctorId)?.name ?? '?' }))
    }),
  ),

  http.post(url('/opd/appointments'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.appointments.create')
      const data = validate(appointmentInputSchema, raw)
      const doc = ctx.db.doctors.find((d) => d.id === data.doctorId)
      if (doc && ctx.db.departments.find((d) => d.id === doc.departmentId)?.casualty) throw new ApiError(400, 'casualty', 'Casualty does not take appointments. Use emergency registration.', { doctorId: 'Casualty takes no appointments' })
      checkSlot(ctx, data)
      const at = nowIso()
      const a: Appointment = { ...data, id: crypto.randomUUID(), clinicId: requireClinic(ctx), status: 'booked', source: 'counter', history: [{ at, by: ctx.user.name, action: `Booked for ${data.date} ${data.slot}` }], createdAt: at }
      ctx.db.appointments.push(a)
      const doctorName = ctx.db.doctors.find((d) => d.id === a.doctorId)!.name
      writeAudit(ctx, { action: 'create', entity: 'appointment', entityId: a.id, summary: `Booked appointment with ${doctorName} on ${a.date} at ${a.slot}` })
      return { ...a, patient: brief(ctx.db, ctx.db.patients.find((p) => p.id === a.patientId)!), doctorName }
    }, 201)
  }),

  http.post(url('/opd/appointments/:id/reschedule'), async ({ request, params }) => {
    const to = (await request.json()) as { doctorId: string; date: string; slot: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.appointments.edit')
      const a = findInClinic(ctx.db.appointments, ctx, params.id as string, 'Appointment')
      if (a.status !== 'booked') throw new ApiError(409, 'not_booked', 'Only booked appointments can be moved.')
      checkSlot(ctx, { ...a, ...to }, a.id)
      const from = `${a.date} ${a.slot}`
      Object.assign(a, to)
      a.history.push({ at: nowIso(), by: ctx.user.name, action: `Moved from ${from} to ${a.date} ${a.slot}` })
      writeAudit(ctx, { action: 'edit', entity: 'appointment', entityId: a.id, summary: `Rescheduled appointment from ${from} to ${a.date} ${a.slot}` })
    }, 204)
  }),

  http.post(url('/opd/appointments/:id/cancel'), async ({ request, params }) => {
    const { reason } = (await request.json()) as { reason: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.appointments.cancel')
      const a = findInClinic(ctx.db.appointments, ctx, params.id as string, 'Appointment')
      if (!reason.trim()) throw new ApiError(400, 'invalid', 'Enter a reason.', { reason: 'Enter a reason' })
      if (a.status !== 'booked') throw new ApiError(409, 'not_booked', 'Only booked appointments can be cancelled.')
      a.status = 'cancelled'
      a.cancelReason = reason.trim()
      a.history.push({ at: nowIso(), by: ctx.user.name, action: `Cancelled: ${reason.trim()}` })
      writeAudit(ctx, { action: 'cancel', entity: 'appointment', entityId: a.id, summary: `Cancelled appointment ${a.date} ${a.slot}: ${reason.trim()}` })
    }, 204)
  }),
]
