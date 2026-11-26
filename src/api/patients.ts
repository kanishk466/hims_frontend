/** Patients (OPD-01): search, register with duplicate check, edit (audited). Wired to the real backend (Stage 6c-i). */
import type { Patient, PatientBrief, PatientInput, VisitRow } from '@/types/opd'
import { request } from './client'

export function searchPatients(q: string, limit = 20): Promise<PatientBrief[]> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (limit !== 20) params.set('limit', String(limit))
  const qs = params.toString()
  return request(`/opd/patients${qs ? `?${qs}` : ''}`)
}

export interface PatientDetail extends Patient {
  visits: VisitRow[]
}

export function getPatient(id: string): Promise<PatientDetail> {
  return request(`/opd/patients/${id}`)
}

export function createPatient(input: PatientInput): Promise<Patient> {
  return request('/opd/patients', { method: 'POST', body: input })
}

export function updatePatient(id: string, input: PatientInput): Promise<Patient> {
  return request(`/opd/patients/${id}`, { method: 'PATCH', body: input })
}

/**
 * Simulated ABDM verification (Integrations → ABDM/ABHA): marks the patient's ABHA number
 * as verified. No real health-registry call is made.
 */
export function verifyAbha(id: string): Promise<Patient> {
  return request(`/opd/patients/${id}/verify-abha`, { method: 'POST' })
}
