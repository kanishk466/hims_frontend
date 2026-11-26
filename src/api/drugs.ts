import type { Page } from '@/types/common'
import type { Drug, DrugInput } from '@/types/masters'
import { request } from './client'

export interface DrugQuery {
  q?: string
  schedule?: string
  includeInactive?: boolean
  page?: number
  pageSize?: number
}

/** Search by brand or generic (the e-prescription drug search uses the same call). */
export function listDrugs(query: DrugQuery = {}): Promise<Page<Drug>> {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.schedule) params.set('schedule', query.schedule)
  if (query.includeInactive) params.set('includeInactive', 'true')
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  const qs = params.toString()
  return request(`/masters/drugs${qs ? `?${qs}` : ''}`)
}

/** Distinct generic names, for the drug form's autocomplete. */
export function listGenerics(): Promise<string[]> {
  return request('/masters/drugs/generics')
}

export function createDrug(input: DrugInput): Promise<Drug> {
  return request('/masters/drugs', { method: 'POST', body: input })
}

export function updateDrug(id: string, input: DrugInput): Promise<Drug> {
  return request(`/masters/drugs/${id}`, { method: 'PATCH', body: input })
}

export function setDrugActive(id: string, active: boolean): Promise<Drug> {
  return request(`/masters/drugs/${id}/activate`, { method: 'POST', body: { active } })
}
