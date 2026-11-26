import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

/** All timestamps are stored in UTC and shown in IST. */
export const IST = 'Asia/Kolkata'

export const toIST = (iso: string | Date) => dayjs(iso).tz(IST)

/** 22-11-2026 */
export const formatDate = (iso: string | Date) => toIST(iso).format('DD-MM-YYYY')
/** 02:15 PM */
export const formatTime = (iso: string | Date) => toIST(iso).format('hh:mm A')
/** 22-11-2026, 02:15 PM */
export const formatDateTime = (iso: string | Date) => toIST(iso).format('DD-MM-YYYY, hh:mm A')
/** Sunday, 22 November 2026 */
export const formatLongDate = (iso: string | Date) => toIST(iso).format('dddd, D MMMM YYYY')

export function greeting(now: Date = new Date()): string {
  const h = toIST(now).hour()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Age shown the Indian OPD way: "34 Y", "8 M", "12 D". */
export function formatAge(dob: string | Date, now: Date = new Date()): string {
  const d = toIST(dob).startOf('day')
  const today = toIST(now).startOf('day')
  const years = today.diff(d, 'year')
  if (years >= 1) return `${years} Y`
  const months = today.diff(d, 'month')
  if (months >= 1) return `${months} M`
  return `${Math.max(0, today.diff(d, 'day'))} D`
}

/** Today's date in IST as YYYY-MM-DD (the clinic's calendar day). */
export const todayIST = (now: Date = new Date()) => toIST(now).format('YYYY-MM-DD')

/** YYYY-MM-DD → 22-11-2026 (no timezone shift: it is already a calendar date). */
export const formatDay = (ymd: string) => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}`

/** Add days to a YYYY-MM-DD date. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
