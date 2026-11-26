/** Generic value lists (salutations, visit types, frequencies…): one table, one screen. */
import type { ValueListItem, ValueListItemInput } from '@/types/valueLists'
import { request } from './client'

/** Items of one list. Any clinic user may read active items (forms everywhere need them). */
export function listValueList(type: string, opts: { includeInactive?: boolean } = {}): Promise<ValueListItem[]> {
  return request(`/masters/value-lists/${encodeURIComponent(type)}${opts.includeInactive ? '?includeInactive=true' : ''}`)
}

/** Item counts per list, for the list picker. */
export function valueListCounts(): Promise<Record<string, number>> {
  return request('/masters/value-lists/counts')
}

export function createValueListItem(type: string, input: ValueListItemInput): Promise<ValueListItem> {
  return request(`/masters/value-lists/${encodeURIComponent(type)}`, { method: 'POST', body: input })
}

export function updateValueListItem(id: string, input: ValueListItemInput): Promise<ValueListItem> {
  return request(`/masters/value-lists/items/${id}`, { method: 'PATCH', body: input })
}

export function setValueListItemActive(id: string, active: boolean): Promise<ValueListItem> {
  return request(`/masters/value-lists/items/${id}/activate`, { method: 'POST', body: { active } })
}

export async function moveValueListItem(id: string, direction: 'up' | 'down'): Promise<void> {
  await request(`/masters/value-lists/items/${id}/move`, { method: 'POST', body: { direction } })
}
