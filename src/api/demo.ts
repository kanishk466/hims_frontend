import { resetDb } from '@/mock/db'
import { mockRequest } from './client'

/**
 * Demo-only: wipe all data and reseed Sunrise Hospital. Also ends every session.
 * Will not exist against the real backend.
 */
export function resetDemoData(): Promise<void> {
  return mockRequest(() => {
    resetDb()
  })
}
