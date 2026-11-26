import { Navigate } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { useCan, usePermissions } from '@/auth/useCan'
import { ALL_MENU_ITEMS, itemPermissions } from './menu'
import { ForbiddenPage } from './pages/ForbiddenPage'

/**
 * "/" sends each user to the right first screen:
 * - a clinic admin whose setup is not finished → the setup wizard
 * - clinic staff → dashboard
 * - super-admin → Clinics (first screen they may view)
 */
export function HomeRedirect() {
  const { data: session } = useSession()
  const perms = usePermissions()
  const canDashboard = useCan('home.dashboard.view')
  const canSetup = useCan('admin.setup.edit')
  if (session?.clinic && !session.clinic.setupComplete && canSetup) return <Navigate to="/admin/setup" replace />
  if (canDashboard) return <Navigate to="/dashboard" replace />
  const first = ALL_MENU_ITEMS.find((i) => itemPermissions(i).some((p) => perms.has(p)))
  return first ? <Navigate to={first.path} replace /> : <ForbiddenPage />
}
