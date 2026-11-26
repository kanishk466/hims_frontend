/** Clinic setup wizard endpoints (GET /setup/progress, hospital profile). */
import type { Clinic, ClinicProfile, SetupProgress } from '@/types/clinic'
import { request } from './client'

export function getSetupProgress(): Promise<SetupProgress> {
  return request('/admin/setup/progress')
}

export function getClinicProfile(): Promise<Clinic> {
  return request('/admin/setup/profile')
}

export function updateClinicProfile(input: ClinicProfile): Promise<Clinic> {
  return request('/admin/setup/profile', { method: 'PATCH', body: input })
}

/** The services & tariffs setup step (optional): already fully editable in Masters, this just records that the admin looked at it. */
export function markServicesReviewed(): Promise<void> {
  return request('/admin/setup/services/reviewed', { method: 'POST' })
}

/** Marks setup finished once the required steps are done. */
export function completeSetup(): Promise<SetupProgress> {
  return request('/admin/setup/complete', { method: 'POST' })
}
