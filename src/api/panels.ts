import type { Panel, PanelInput } from '@/types/masters'
import { request } from './client'

export function listPanels(opts: { includeInactive?: boolean } = {}): Promise<Panel[]> {
  return request(`/masters/panels${opts.includeInactive ? '?includeInactive=true' : ''}`)
}

export function createPanel(input: PanelInput): Promise<Panel> {
  return request('/masters/panels', { method: 'POST', body: input })
}

export function updatePanel(id: string, input: PanelInput): Promise<Panel> {
  return request(`/masters/panels/${id}`, { method: 'PATCH', body: input })
}

export function setPanelActive(id: string, active: boolean): Promise<Panel> {
  return request(`/masters/panels/${id}/activate`, { method: 'POST', body: { active } })
}
