/** Check-in, token and queue (OPD-04), TV board. Wired to the real backend (Stage 6c-ii). */
import type { CheckInInput, ReferralInput, VisitRow, VisitStatus, VisitSuggestion } from '@/types/opd'
import { request } from './client'

export interface CheckInPreview extends VisitSuggestion {
  feePaise: number
  patientPaysPaise: number
  panelPaysPaise: number
  priceNote: string
  /** Visits today with this doctor already (to warn about double check-in). */
  alreadyToday: boolean
  onLeave: string | null
  hasSessionToday: boolean
  /** Documents and approval the payer needs at check-in. */
  panelNeeds: { documents: string[]; priorApproval: boolean }
}

/** What check-in will do for this patient + doctor + payer: visit type, fee, split, warnings. */
export function previewCheckIn(q: { patientId: string; doctorId: string; payerId: string; category: string; visitType?: string }): Promise<CheckInPreview> {
  const params = new URLSearchParams({ patientId: q.patientId, doctorId: q.doctorId, payerId: q.payerId, category: q.category })
  if (q.visitType) params.set('visitType', q.visitType)
  return request(`/opd/checkin/preview?${params.toString()}`)
}

export function checkIn(input: CheckInInput): Promise<VisitRow> {
  return request('/opd/checkin', { method: 'POST', body: input })
}

export interface VisitQuery {
  date?: string
  doctorId?: string
  /** "open" = not completed/cancelled/no-show */
  status?: VisitStatus | 'open'
  q?: string
}

export function listVisits(q: VisitQuery = {}): Promise<VisitRow[]> {
  const params = new URLSearchParams()
  if (q.date) params.set('date', q.date)
  if (q.doctorId) params.set('doctorId', q.doctorId)
  if (q.status) params.set('status', q.status)
  if (q.q) params.set('q', q.q)
  const qs = params.toString()
  return request(`/opd/visits${qs ? `?${qs}` : ''}`)
}

export function getVisit(id: string): Promise<VisitRow> {
  return request(`/opd/visits/${id}`)
}

/** Call a token into the doctor's room. Only one patient at a time per doctor. */
export function callVisit(id: string): Promise<VisitRow> {
  return request(`/opd/visits/${id}/call`, { method: 'POST' })
}

/** Call the next token that may be called (priority first). */
export function callNext(doctorId: string): Promise<VisitRow | null> {
  return request(`/opd/visits/call-next?doctorId=${doctorId}`, { method: 'POST' })
}

/** Skip: the token goes to the end of the queue (patient not present). */
export function skipVisit(id: string): Promise<void> {
  return request(`/opd/visits/${id}/skip`, { method: 'POST' })
}

/** Recall: put a skipped token back at the front. */
export function recallVisit(id: string): Promise<void> {
  return request(`/opd/visits/${id}/recall`, { method: 'POST' })
}

/** Move to another doctor with a reason: new token there; payment stays with the visit. */
export function transferVisit(id: string, doctorId: string, reason: string): Promise<VisitRow> {
  return request(`/opd/visits/${id}/transfer`, { method: 'POST', body: { doctorId, reason } })
}

/**
 * Refer to another doctor in the same episode (OPD workbench): unlike transfer, the
 * original visit and its consultation note stay with the referring doctor; the other
 * doctor gets a new, free token today (`waiveConsultation`), linked by `referredFromVisitId`.
 */
export function referVisit(id: string, input: ReferralInput): Promise<VisitRow> {
  return request(`/opd/visits/${id}/refer`, { method: 'POST', body: input })
}

export function markNoShow(id: string): Promise<void> {
  return request(`/opd/visits/${id}/no-show`, { method: 'POST' })
}

/** Cancel a visit (wrong doctor, patient left). Paid visits need the bill cancelled first. */
export function cancelVisit(id: string, reason: string): Promise<void> {
  return request(`/opd/visits/${id}/cancel`, { method: 'POST', body: { reason } })
}

export interface TvDoctor {
  doctorId: string
  doctorName: string
  departmentName: string
  color: string
  room?: string
  nowServing: string | null
  next: string[]
  waiting: number
}

/** TV board: now serving and next tokens per doctor (OPD-04). No patient names. */
export function tvBoard(): Promise<{ clinicName: string; doctors: TvDoctor[] }> {
  return request('/opd/visits/tv-board')
}
