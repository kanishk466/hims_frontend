import { formatAge } from '@/lib/dates'
import type { PatientBrief } from '@/types/opd'

/** "34 Y / M", "8 M (approx.) / F" */
export const patientAgeSex = (p: Pick<PatientBrief, 'dob' | 'dobApprox' | 'gender'>) => `${formatAge(p.dob)}${p.dobApprox ? ' (approx.)' : ''} / ${p.gender}`

/** Date of birth from an age in years (approximate: same day and month, N years ago). */
export function dobFromAge(years: number, today: string): string {
  const y = Number(today.slice(0, 4)) - years
  return `${y}${today.slice(4)}`
}

/** Whole years between a YYYY-MM-DD date of birth and today. */
export function yearsSince(dob: string, today: string): number {
  let years = Number(today.slice(0, 4)) - Number(dob.slice(0, 4))
  if (today.slice(5) < dob.slice(5)) years--
  return Math.max(0, years)
}
