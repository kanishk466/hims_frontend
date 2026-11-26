import type { Clinic } from '@/types/auth'
import { ApiError } from './client'
import { endpoint, requireClinic } from './_server'

/** The clinic of the logged-in user. */
export function getCurrentClinic(): Promise<Clinic> {
  return endpoint(null, (ctx) => {
    const clinicId = requireClinic(ctx)
    const clinic = ctx.db.clinics.find((c) => c.id === clinicId)
    if (!clinic) throw new ApiError(404, 'clinic_not_found', 'Clinic not found.')
    return clinic
  })
}
