/**
 * Emergency quick registration (OPD Spec OPD-14): an unknown or unconscious patient gets a
 * temporary UHID and goes straight to the casualty doctor with an E-token. MLC details are
 * recorded on the visit and make it impossible to cancel. The temporary record is later merged
 * into the patient's real record, or completed and given a normal UHID.
 * Wired to the real backend (Stage 6c-i).
 */
import type { EmergencyInput, Patient, PatientBrief, PatientInput, VisitRow } from '@/types/opd'
import { request } from './client'

export interface CasualtyDoctor {
  id: string
  name: string
  departmentName: string
  /** Has a session running now. */
  onDuty: boolean
}

export interface EmergencyContext {
  doctors: CasualtyDoctor[]
  /** Pre-selected: the first doctor on duty now. */
  defaultDoctorId: string | null
  /** Temporary records still waiting to be identified. */
  toIdentify: (PatientBrief & { createdAt: string; visit?: VisitRow })[]
  /** Today's casualty visits. */
  today: VisitRow[]
}

export function getEmergencyContext(): Promise<EmergencyContext> {
  return request('/opd/emergency/context')
}

/** Register and check in, in one step. Returns the casualty visit with its E-token. */
export function registerEmergency(input: EmergencyInput): Promise<VisitRow> {
  return request('/opd/emergency/register', { method: 'POST', body: input })
}

/** Add or correct MLC details on a casualty visit. Once recorded, MLC cannot be removed. */
export function recordMlc(visitId: string, mlc: { policeStation: string; mlcNo: string; officerName?: string }): Promise<VisitRow> {
  return request(`/opd/emergency/visits/${visitId}/mlc`, { method: 'POST', body: mlc })
}

/**
 * The patient turned out to be registered already: move the casualty visits (and their
 * vitals, notes, orders and bills, which hang off the visit) to the real record.
 */
export function mergeTemporaryPatient(tempId: string, targetId: string): Promise<Patient> {
  return request(`/opd/emergency/patients/${tempId}/merge/${targetId}`, { method: 'POST' })
}

/** Not registered before: complete the details and give the record a normal UHID. */
export function confirmTemporaryPatient(tempId: string, input: PatientInput): Promise<Patient> {
  return request(`/opd/emergency/patients/${tempId}/confirm`, { method: 'POST', body: input })
}
