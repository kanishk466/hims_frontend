import { slotCount, type DoctorSchedule } from '@/types/masters'

/** "24 slots of 10 min · max 30 · 6 walk-in · OPD 1" */
export function sessionSummary(s: DoctorSchedule): string {
  const parts = [`${slotCount(s)} slots of ${s.slotMinutes} min`]
  if (s.maxPatients) parts.push(`max ${s.maxPatients}`)
  if (s.walkInQuota) parts.push(`${s.walkInQuota} walk-in`)
  if (s.room) parts.push(s.room)
  return parts.join(' · ')
}
