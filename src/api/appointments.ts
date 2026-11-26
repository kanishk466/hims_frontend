/** Appointments (OPD-03): slots from schedules, book, reschedule, cancel; history kept. Wired to the real backend (Stage 6c-i). */
import type { Appointment, AppointmentInput, DaySlots, PatientBrief } from '@/types/opd'
import { request } from './client'

export function getDaySlots(doctorId: string, date: string): Promise<DaySlots> {
  return request(`/opd/appointments/slots?doctorId=${doctorId}&date=${date}`)
}

export interface AppointmentRow extends Appointment {
  patient: PatientBrief
  doctorName: string
}

/** A day's appointments for all (or one) doctors: check-in uses this for "expected today". */
export function listAppointments(date: string, doctorId?: string): Promise<AppointmentRow[]> {
  const params = new URLSearchParams({ date })
  if (doctorId) params.set('doctorId', doctorId)
  return request(`/opd/appointments?${params.toString()}`)
}

export function bookAppointment(input: AppointmentInput): Promise<AppointmentRow> {
  return request('/opd/appointments', { method: 'POST', body: input })
}

export function rescheduleAppointment(id: string, to: { doctorId: string; date: string; slot: string }): Promise<void> {
  return request(`/opd/appointments/${id}/reschedule`, { method: 'POST', body: to })
}

/** Cancel keeps the record; the slot becomes free again (OPD-03). */
export function cancelAppointment(id: string, reason: string): Promise<void> {
  return request(`/opd/appointments/${id}/cancel`, { method: 'POST', body: { reason } })
}
