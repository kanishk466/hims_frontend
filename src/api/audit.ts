import type { AuditEntry } from '@/types/auth'
import type { Page } from '@/types/common'
import { request } from './client'

export interface AuditQuery {
  q?: string
  entity?: string
  userId?: string
  page?: number
  pageSize?: number
}

function queryString(query: AuditQuery): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.entity) params.set('entity', query.entity)
  if (query.userId) params.set('userId', query.userId)
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  return params.toString()
}

/** Audit log of the clinic, newest first. */
export function listAudit(query: AuditQuery = {}): Promise<Page<Omit<AuditEntry, 'before' | 'after'> & { details?: string }>> {
  const qs = queryString(query)
  return request(`/admin/audit${qs ? `?${qs}` : ''}`)
}
