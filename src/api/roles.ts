/** Roles and their permission grid (Users screen & Roles screen). */
import { CLINIC_PERMISSIONS, type Permission } from '@/auth/permissions'
import type { RoleDetail, RoleInput } from '@/types/auth'
import { request } from './client'

/**
 * Keep only real clinic permissions, and add "view" for any screen that has another
 * action ticked (you cannot create on a screen you cannot open). Still used client-side by
 * the Roles screen to preview a role's effective permission set as the admin ticks boxes;
 * the backend re-applies the same rule server-side before saving.
 */
export function normalisePermissions(codes: string[]): Permission[] {
  const allowed = new Set<string>(CLINIC_PERMISSIONS)
  const out = new Set<Permission>()
  for (const c of codes) {
    if (!allowed.has(c)) continue
    out.add(c as Permission)
    const view = c.replace(/\.[a-z]+$/, '.view')
    if (allowed.has(view)) out.add(view as Permission)
  }
  return [...out].sort()
}

export function listRoleDetails(): Promise<RoleDetail[]> {
  return request('/admin/roles')
}

/** New role, empty or copied from another role ("Copy role"). */
export function createRole(input: RoleInput, copyFromId?: string): Promise<RoleDetail> {
  const qs = copyFromId ? `?copyFrom=${encodeURIComponent(copyFromId)}` : ''
  return request(`/admin/roles${qs}`, { method: 'POST', body: input })
}

export function updateRole(id: string, input: RoleInput): Promise<RoleDetail> {
  return request(`/admin/roles/${id}`, { method: 'PATCH', body: input })
}

/** Custom roles can be deactivated once no active user holds them. System roles cannot. */
export function setRoleActive(id: string, active: boolean): Promise<RoleDetail> {
  return request(`/admin/roles/${id}/active`, { method: 'PATCH', body: { active } })
}
