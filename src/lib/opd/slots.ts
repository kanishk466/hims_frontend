/** Appointment slots from a doctor's weekly sessions (OPD-03). */
import type { DoctorSchedule } from '@/types/masters'

const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Weekday (0 = Sunday) of a YYYY-MM-DD date. */
export const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay()

export function sessionsOn(schedules: DoctorSchedule[], doctorId: string, ymd: string): DoctorSchedule[] {
  const wd = weekdayOf(ymd)
  return schedules.filter((s) => s.active && s.doctorId === doctorId && s.weekdays.includes(wd)).sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * Bookable times of a session. When a maximum is set, the walk-in quota is kept free:
 * bookable = max − walk-in (never more than the number of slot times).
 */
export function slotTimes(s: Pick<DoctorSchedule, 'start' | 'end' | 'slotMinutes' | 'maxPatients' | 'walkInQuota'>): string[] {
  const out: string[] = []
  for (let m = toMin(s.start); m + s.slotMinutes <= toMin(s.end); m += s.slotMinutes) out.push(toTime(m))
  const bookable = s.maxPatients ? Math.max(0, s.maxPatients - (s.walkInQuota ?? 0)) : out.length
  return out.slice(0, bookable)
}

/** Has the session ended (for automatic no-show)? */
export const sessionEnded = (ymd: string, end: string, today: string, nowHHMM: string) => ymd < today || (ymd === today && end <= nowHHMM)
