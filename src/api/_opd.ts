/** Server-side OPD helpers shared by the OPD endpoints. */
import dayjs from 'dayjs'
import { toIST, todayIST } from '@/lib/dates'
import { lookupPrice } from '@/lib/pricing'
import { sessionEnded, sessionsOn } from '@/lib/opd/slots'
import type { DbShape } from '@/mock/db'
import { consultationServiceId } from '@/mock/seed/masters'
import type { Patient, PatientBrief, Visit, VisitRow } from '@/types/opd'
import { DEFAULT_OPD_SETTINGS } from '@/types/opd'
import { requireClinic, type RequestContext } from './_server'

export const nowHHMM = (now = new Date()) => toIST(now).format('HH:mm')

export function brief(db: DbShape, p: Patient): PatientBrief {
  const last = db.visits.filter((v) => v.patientId === p.id && v.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date))[0]
  return {
    id: p.id,
    uhid: p.uhid,
    name: p.name,
    gender: p.gender,
    dob: p.dob,
    dobApprox: p.dobApprox,
    mobile: p.mobile,
    category: p.category,
    allergies: p.allergies,
    lastVisitDate: last?.date,
    temporary: p.temporary,
  }
}

export const label = (db: DbShape, clinicId: string, type: string, code: string) =>
  db.valueListItems.find((v) => v.clinicId === clinicId && v.type === type && v.code === code)?.label ?? code

export function payerName(db: DbShape, payerId: string) {
  return payerId === 'cash' ? 'Cash' : db.panels.find((p) => p.id === payerId)?.name ?? payerId
}

export function settingsOf(db: DbShape, clinicId: string) {
  return { ...DEFAULT_OPD_SETTINGS, ...db.clinics.find((c) => c.id === clinicId)?.opdSettings }
}

export function toRow(db: DbShape, v: Visit, now = new Date()): VisitRow {
  const patient = db.patients.find((p) => p.id === v.patientId)!
  const doctor = db.doctors.find((d) => d.id === v.doctorId)
  const dept = db.departments.find((d) => d.id === v.departmentId)
  const room = sessionsOn(db.schedules, v.doctorId, v.date)[0]?.room
  const until = v.calledAt ?? v.completedAt ?? now.toISOString()
  return {
    ...v,
    patient: brief(db, patient),
    doctorName: doctor?.name ?? '?',
    departmentName: dept?.name ?? '?',
    room,
    visitTypeLabel: label(db, v.clinicId, 'visitType', v.visitType),
    payerName: payerName(db, v.payerId),
    hasVitals: db.vitals.some((x) => x.visitId === v.id),
    pendingCharges: db.orders.filter((o) => o.visitId === v.id && o.status === 'ordered').length,
    waitingMinutes: Math.max(0, dayjs(until).diff(dayjs(v.checkedInAt), 'minute')),
  }
}

/**
 * Lazy day-end jobs (real system: scheduled jobs).
 * - OPD-03: booked appointments whose session has ended become no-shows.
 * - Spec "Visit auto-close": open visits of earlier days close (in consultation → completed, else no-show).
 */
export function housekeeping(ctx: RequestContext, now = new Date()) {
  const clinicId = requireClinic(ctx)
  const today = todayIST(now)
  const hhmm = nowHHMM(now)
  const at = now.toISOString()
  for (const a of ctx.db.appointments) {
    if (a.clinicId !== clinicId || a.status !== 'booked') continue
    const session = sessionsOn(ctx.db.schedules, a.doctorId, a.date).find((s) => a.slot >= s.start && a.slot < s.end)
    const end = session?.end ?? '23:59'
    if (sessionEnded(a.date, end, today, hhmm)) {
      a.status = 'noShow'
      a.history.push({ at, by: 'system', action: 'Marked no-show: did not arrive by the end of the session' })
    }
  }
  for (const v of ctx.db.visits) {
    if (v.clinicId !== clinicId || v.date >= today || ['completed', 'cancelled', 'noShow'].includes(v.status)) continue
    // Casualty runs round the clock: an emergency visit stays open until the doctor completes it.
    if (v.emergency) continue
    const next = v.status === 'inConsultation' ? 'completed' : 'noShow'
    v.status = next
    v.history.push({ at, by: 'system', action: `Closed at day end as ${next === 'completed' ? 'completed' : 'no-show'}` })
  }
}

/** Price of a service for a visit (tariff engine) and the explanation. */
export function priceFor(db: DbShape, v: Pick<Visit, 'clinicId' | 'doctorId' | 'visitType' | 'payerId' | 'category' | 'date'>, serviceId: string) {
  const service = db.services.find((s) => s.id === serviceId)!
  const panel = v.payerId !== 'cash' ? db.panels.find((p) => p.id === v.payerId) : null
  return lookupPrice(
    { serviceId, doctorId: v.doctorId, visitType: v.visitType, payerId: v.payerId, patientCategory: v.category, date: v.date },
    service,
    db.tariffs.filter((t) => t.clinicId === v.clinicId),
    panel,
  )
}

export const consultServiceOf = (clinicId: string) => consultationServiceId(clinicId)

/** Age in whole years (for vitals ranges and display). */
export function ageYears(dob: string, today = todayIST()): number {
  return Math.max(0, dayjs(today).diff(dayjs(dob), 'year'))
}

/** The doctor linked to the user (for "my queue"). In preview, the previewed user's. */
export function myDoctorId(ctx: RequestContext): string | undefined {
  return (ctx.previewOf ?? ctx.user).doctorId
}

export function actorName(ctx: RequestContext) {
  return ctx.user.name
}
