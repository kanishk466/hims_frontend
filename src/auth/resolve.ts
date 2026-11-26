import type { Role, User } from '@/types/auth'
import { CLINIC_PERMISSIONS, PLATFORM_PERMISSIONS, type Permission } from './permissions'

/**
 * Effective permissions of a user = union of the permissions of their active roles.
 * Super-admins get the platform permissions only; they do not see clinic data.
 * Pure function: used by the (mock) server and in tests.
 */
export function resolvePermissions(user: Pick<User, 'isSuperAdmin' | 'roleIds' | 'clinicId'>, roles: Role[]): Permission[] {
  if (user.isSuperAdmin) return [...PLATFORM_PERMISSIONS]
  const allowed = new Set<Permission>(CLINIC_PERMISSIONS)
  const result = new Set<Permission>()
  for (const role of roles) {
    if (!role.active || role.clinicId !== user.clinicId || !user.roleIds.includes(role.id)) continue
    for (const p of role.permissions) if (allowed.has(p)) result.add(p)
  }
  return [...result].sort()
}
