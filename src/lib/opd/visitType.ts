/**
 * Which visit type applies at check-in (OPD-05: "Free follow-up within the configured
 * window is detected automatically"). Windows come from the visit-type value list:
 *   freeFollowUp.validityDays (default 7) and followUp.validityDays (default 30),
 * counted from the patient's last PAID visit with the same doctor.
 */
export interface PastVisit {
  doctorId: string
  date: string // YYYY-MM-DD
  visitType: string
  status: string
}

export interface VisitTypeRule {
  freeDays: number
  followUpDays: number
  freeAllowed: number
}

export interface VisitTypeSuggestion {
  visitType: 'new' | 'followUp' | 'freeFollowUp'
  reason: string
  lastPaidDate?: string
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export function suggestVisitType(history: PastVisit[], doctorId: string, today: string, rule: VisitTypeRule): VisitTypeSuggestion {
  const valid = history.filter((v) => v.doctorId === doctorId && v.date < today && v.status !== 'cancelled' && v.status !== 'noShow')
  const paid = valid.filter((v) => v.visitType !== 'freeFollowUp').sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!paid) return { visitType: 'new', reason: 'First visit with this doctor' }
  const days = daysBetween(paid.date, today)
  const freeUsed = valid.filter((v) => v.visitType === 'freeFollowUp' && v.date > paid.date).length
  if (days <= rule.freeDays && freeUsed < rule.freeAllowed) {
    return { visitType: 'freeFollowUp', reason: `Last paid visit ${days} day${days === 1 ? '' : 's'} ago: within the ${rule.freeDays}-day free follow-up`, lastPaidDate: paid.date }
  }
  if (days <= rule.followUpDays) {
    const why = days <= rule.freeDays ? 'free follow-up already used' : `beyond the ${rule.freeDays}-day free window`
    return { visitType: 'followUp', reason: `Last paid visit ${days} days ago (${why}): follow-up fee`, lastPaidDate: paid.date }
  }
  return { visitType: 'new', reason: `Last paid visit ${days} days ago: more than ${rule.followUpDays} days, so a new visit`, lastPaidDate: paid.date }
}
