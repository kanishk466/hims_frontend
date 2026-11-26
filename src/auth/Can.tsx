import type { ReactNode } from 'react'
import type { Permission } from './permissions'
import { useCan } from './useCan'

interface CanProps {
  permission: Permission | Permission[]
  /** With a list: "any" (default) or "all" must be held. */
  mode?: 'any' | 'all'
  children: ReactNode
  /** Rendered instead of children when not allowed. Default: nothing (the button is hidden). */
  fallback?: ReactNode
}

/**
 * Hides its children when the user lacks the permission.
 *   <Can permission="opd.billing.cancel"><Button>Cancel bill</Button></Can>
 * This is UX only: the API checks permissions again.
 */
export function Can({ permission, mode = 'any', children, fallback = null }: CanProps) {
  return useCan(permission, mode) ? <>{children}</> : <>{fallback}</>
}
