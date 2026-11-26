import type { Department, DepartmentInput } from '@/types/masters'
import { request } from './client'

export interface ListOptions {
  includeInactive?: boolean
}

export function listDepartments(opts: ListOptions = {}): Promise<Department[]> {
  return request(`/masters/departments${opts.includeInactive ? '?includeInactive=true' : ''}`)
}

export function createDepartment(input: DepartmentInput): Promise<Department> {
  return request('/masters/departments', { method: 'POST', body: input })
}

export function updateDepartment(id: string, input: DepartmentInput): Promise<Department> {
  return request(`/masters/departments/${id}`, { method: 'PATCH', body: input })
}

/** Deactivate (needs Cancel) or reactivate (needs Edit). A department with active doctors cannot be deactivated. */
export function setDepartmentActive(id: string, active: boolean): Promise<Department> {
  return request(`/masters/departments/${id}/activate`, { method: 'POST', body: { active } })
}

/** Move a department one place up or down in lists and the queue screen. */
export function moveDepartment(id: string, direction: 'up' | 'down'): Promise<Department> {
  return request(`/masters/departments/${id}/move`, { method: 'POST', body: { direction } })
}
