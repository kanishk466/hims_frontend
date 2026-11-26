import type { ReactNode } from 'react'
import { ForbiddenPage } from '@/app/pages/ForbiddenPage'
import type { Permission } from './permissions'
import { useCan } from './useCan'

/** Route guard: shows the 403 page when the user lacks the route's "view" permission. */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  return useCan(permission) ? <>{children}</> : <ForbiddenPage />
}
