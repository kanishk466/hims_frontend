/** Platform (super-admin) endpoints: clinics and provisioning. */
import type { ClinicSummary, CreateClinicInput, ProvisionResult, UpdateClinicInput } from '@/types/clinic'
import { request } from './client'

export function listClinics(): Promise<ClinicSummary[]> {
  return request('/platform/clinics')
}

/** True when the code is free. Used by the create form while typing. */
export function isClinicCodeAvailable(code: string): Promise<boolean> {
  return request<{ available: boolean }>(`/platform/clinics/code-available?code=${encodeURIComponent(code)}`).then((r) => r.available)
}

/** POST /platform/clinics — creates and provisions a clinic, and invites its admin. */
export function createClinic(input: CreateClinicInput): Promise<ProvisionResult> {
  return request('/platform/clinics', { method: 'POST', body: input })
}

export function updateClinic(id: string, input: UpdateClinicInput): Promise<ClinicSummary> {
  return request(`/platform/clinics/${id}`, { method: 'PATCH', body: input })
}

/** New invite link for the clinic's admin (old link stops working). */
export function resendAdminInvite(clinicId: string): Promise<{ inviteToken: string; inviteExpiresAt: string }> {
  return request(`/platform/clinics/${clinicId}/resend-invite`, { method: 'POST' })
}
