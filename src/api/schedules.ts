import type { DoctorSchedule, ScheduleInput } from '@/types/masters'
import { request } from './client'

export function listSchedules(opts: { doctorId?: string; includeInactive?: boolean } = {}): Promise<DoctorSchedule[]> {
  const params = new URLSearchParams()
  if (opts.doctorId) params.set('doctorId', opts.doctorId)
  if (opts.includeInactive) params.set('includeInactive', 'true')
  const qs = params.toString()
  return request(`/masters/schedules${qs ? `?${qs}` : ''}`)
}

export function createSchedule(input: ScheduleInput): Promise<DoctorSchedule> {
  return request('/masters/schedules', { method: 'POST', body: input })
}

export function updateSchedule(id: string, input: ScheduleInput): Promise<DoctorSchedule> {
  return request(`/masters/schedules/${id}`, { method: 'PATCH', body: input })
}

/** Sessions are removed by deactivating them; existing appointments keep their history. */
export function setScheduleActive(id: string, active: boolean): Promise<DoctorSchedule> {
  return request(`/masters/schedules/${id}/activate`, { method: 'POST', body: { active } })
}
