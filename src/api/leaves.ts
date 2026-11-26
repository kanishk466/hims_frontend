import type { Leave, LeaveInput } from '@/types/masters'
import { request } from './client'

/** Doctor leave and hospital holidays. Default: today onwards. */
export function listLeaves(opts: { includePast?: boolean } = {}): Promise<Leave[]> {
  return request(`/masters/leaves${opts.includePast ? '?includePast=true' : ''}`)
}

export function createLeave(input: LeaveInput): Promise<Leave> {
  return request('/masters/leaves', { method: 'POST', body: input })
}

/** Cancel a leave entry (e.g. doctor will come after all). */
export function cancelLeave(id: string): Promise<void> {
  return request(`/masters/leaves/${id}/cancel`, { method: 'POST' })
}
