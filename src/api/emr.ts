/**
 * Doctor workbench (OPD-07/08/09): consultation note with ICD-10 diagnoses,
 * e-prescription, test orders, templates; lock on completion, addenda after.
 * Wired to the real backend (Stage 6c-ii).
 */
import type { ClinicalNote, Icd10, NoteContent, Order, OrderSet, Patient, RxTemplate, Vitals, VisitRow } from '@/types/opd'
import { request } from './client'

export function searchIcd10(q: string): Promise<Icd10[]> {
  return request(`/opd/icd10?q=${encodeURIComponent(q)}`)
}

export interface PastVisitSummary {
  visitId: string
  date: string
  doctorName: string
  visitTypeLabel: string
  diagnoses: string[]
  drugs: string[]
  vitals?: string
}

export interface Consultation {
  visit: VisitRow
  patient: Patient
  note: ClinicalNote
  vitals: Vitals | null
  orders: Order[]
  pastVisits: PastVisitSummary[]
  /** Last locked note of this patient (for "copy last visit"). */
  lastNote: (NoteContent & { date: string; doctorName: string }) | null
  templates: RxTemplate[]
  orderSets: OrderSet[]
}

export function getConsultation(visitId: string): Promise<Consultation> {
  return request(`/opd/visits/${visitId}/consultation`)
}

/** Save the draft (auto-save every 30 s and on leaving a section). */
export function saveNote(visitId: string, content: NoteContent): Promise<ClinicalNote> {
  return request(`/opd/visits/${visitId}/notes`, { method: 'POST', body: content })
}

/** Complete: save, lock the note and close the visit (OPD-07). */
export function completeConsultation(visitId: string, content: NoteContent): Promise<ClinicalNote> {
  return request(`/opd/visits/${visitId}/complete`, { method: 'POST', body: content })
}

export function addAddendum(visitId: string, text: string): Promise<ClinicalNote> {
  return request(`/opd/visits/${visitId}/notes/addendum`, { method: 'POST', body: { text } })
}

/** Order tests or procedures; they appear as pending charges at billing (OPD-09). */
export function orderServices(visitId: string, serviceIds: string[]): Promise<Order[]> {
  return request(`/opd/visits/${visitId}/orders`, { method: 'POST', body: { serviceIds } })
}

export function cancelOrder(orderId: string): Promise<void> {
  return request(`/opd/orders/${orderId}/cancel`, { method: 'POST' })
}

/** Save the current prescription as a personal template ("Viral fever adult"). */
export function saveRxTemplate(visitId: string, name: string, content: Pick<NoteContent, 'complaints' | 'diagnoses' | 'rx' | 'advice'>, shared = false): Promise<RxTemplate> {
  return request(`/opd/visits/${visitId}/rx-templates`, { method: 'POST', body: { name, shared, ...content } })
}

export interface PrescriptionView {
  clinic: { name: string; legalName: string; addressLine: string; city: string; pinCode: string; phone: string; email?: string; logoDataUrl?: string; registrationNo: string }
  doctor: { name: string; qualification: string; registrationNo: string; council: string; departmentName: string }
  patient: Patient
  visit: VisitRow
  note: ClinicalNote
  vitals: Vitals | null
  orders: Order[]
  labels: { frequency: Record<string, string>; timing: Record<string, string>; route: Record<string, string> }
  printedAt: string
}

export function getPrescriptionView(visitId: string): Promise<PrescriptionView> {
  return request(`/opd/visits/${visitId}/prescription-view`)
}
