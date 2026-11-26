/** Vitals (OPD-06): record before consultation; out-of-range values flagged for the doctor. Wired to the real backend (Stage 6c-ii). */
import type { Vitals, VitalsInput } from '@/types/opd'
import { request } from './client'

export function getVitals(visitId: string): Promise<Vitals | null> {
  return request(`/opd/visits/${visitId}/vitals`)
}

/** Save (first time: create, later: edit). Moves the visit to "Vitals done". */
export function saveVitals(visitId: string, input: VitalsInput): Promise<Vitals> {
  return request(`/opd/visits/${visitId}/vitals`, { method: 'POST', body: input })
}
