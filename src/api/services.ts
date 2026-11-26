import type { Service, ServiceInput } from '@/types/masters'
import { request } from './client'

export function listServices(opts: { includeInactive?: boolean } = {}): Promise<Service[]> {
  return request(`/masters/services${opts.includeInactive ? '?includeInactive=true' : ''}`)
}

export function createService(input: ServiceInput): Promise<Service> {
  return request('/masters/services', { method: 'POST', body: input })
}

export function updateService(id: string, input: ServiceInput): Promise<Service> {
  return request(`/masters/services/${id}`, { method: 'PATCH', body: input })
}

export function setServiceActive(id: string, active: boolean): Promise<Service> {
  return request(`/masters/services/${id}/activate`, { method: 'POST', body: { active } })
}
