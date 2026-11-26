/** Clinic users (Users screen). */
import type { OverridePinInput, Role, UserInput, UserSummary } from '@/types/auth'
import { request } from './client'

export function listUsers(): Promise<UserSummary[]> {
  return request('/admin/users')
}

export function listRoles(): Promise<Pick<Role, 'id' | 'name' | 'description' | 'templateKey' | 'isSystem'>[]> {
  return request('/admin/users/roles')
}

/** Creates the user and sends an invite (status "invited" until they accept it). */
export function createUser(input: UserInput): Promise<UserSummary & { inviteToken: string }> {
  return request('/admin/users', { method: 'POST', body: input })
}

export function updateUser(id: string, input: UserInput): Promise<UserSummary> {
  return request(`/admin/users/${id}`, { method: 'PATCH', body: input })
}

/**
 * Set or clear a user's discount-override PIN (OPD-05): lets them approve a cashier's
 * discount above their own limit by typing this PIN at the counter, without signing in.
 * Meaningful only for someone who holds Billing → Approve, but any active user may have one.
 */
export function setOverridePin(id: string, input: OverridePinInput): Promise<void> {
  return request(`/admin/users/${id}/pin`, { method: 'PATCH', body: input })
}

export function resendUserInvite(id: string): Promise<{ inviteToken: string }> {
  return request(`/admin/users/${id}/resend-invite`, { method: 'POST' })
}
