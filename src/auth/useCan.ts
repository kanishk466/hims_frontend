import { useMemo } from 'react'
import type { Permission } from './permissions'
import { useSession } from './queries'

export function usePermissions(): ReadonlySet<Permission> {
  const { data } = useSession()
  return useMemo(() => new Set(data?.permissions ?? []), [data])
}

/** True when the user has the permission (or, for a list, any of them unless mode = "all"). */
export function useCan(permission: Permission | Permission[], mode: 'any' | 'all' = 'any'): boolean {
  const perms = usePermissions()
  const list = Array.isArray(permission) ? permission : [permission]
  return mode === 'all' ? list.every((p) => perms.has(p)) : list.some((p) => perms.has(p))
}
