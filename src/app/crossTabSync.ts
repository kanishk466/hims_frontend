import type { QueryClient } from '@tanstack/react-query'
import { DB_STORAGE_KEY_PUBLIC } from '@/api/client'

/**
 * Demo tabs share one browser store: when another tab changes data (check-in at the
 * front desk, call-next in the doctor's tab), refresh this tab's screens. The TV
 * display relies on this. Real system: server push / polling.
 */
export function startCrossTabSync(qc: QueryClient) {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e) => {
    if (e.key === DB_STORAGE_KEY_PUBLIC) qc.invalidateQueries()
  })
}
