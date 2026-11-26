import type { Doctor, DoctorInput } from '@/types/masters'
import { request } from './client'
import type { ListOptions } from './departments'

export function listDoctors(opts: ListOptions = {}): Promise<Doctor[]> {
  return request(`/masters/doctors${opts.includeInactive ? '?includeInactive=true' : ''}`)
}

export function createDoctor(input: DoctorInput): Promise<Doctor> {
  return request('/masters/doctors', { method: 'POST', body: input })
}

export function updateDoctor(id: string, input: DoctorInput): Promise<Doctor> {
  return request(`/masters/doctors/${id}`, { method: 'PATCH', body: input })
}

export function setDoctorActive(id: string, active: boolean): Promise<Doctor> {
  return request(`/masters/doctors/${id}/activate`, { method: 'POST', body: { active } })
}
