/**
 * Price lookup (Onboarding & Masters → Engineering design → Versioned tariffs).
 *
 * Rates are never overwritten: each tariff row has validFrom, and a newer row for the
 * same combination supersedes it from that date. The lookup picks the MOST SPECIFIC
 * approved row valid on the date:
 *   doctor (8) + payer (4) + visit type (2) + patient category (1)
 * then falls back step by step to the service's default rate.
 * For a panel whose contract uses "hospital tariff ± %", the hospital price is found
 * first and then adjusted.
 *
 * Pure: no store access. Billing (build step 5) calls it through the API.
 */
import type { Panel, Service, Tariff } from '@/types/masters'
import type { Paise } from '@/types/common'
import { formatDay } from './dates'

export interface PriceQuery {
  serviceId: string
  doctorId?: string | null
  visitType?: string | null
  /** null/undefined or "cash" = self-pay; otherwise a panel id */
  payerId?: string | null
  patientCategory?: string | null
  /** YYYY-MM-DD; the visit date */
  date: string
}

export interface PriceResult {
  amountPaise: Paise
  source: 'tariff' | 'default' | 'panelAdjusted'
  tariffId?: string
  /** Plain-English explanation for the price check screen and bill audit. */
  explanation: string
  /** Fields of the matched row that were specific (not "any"). */
  matchedOn: ('doctor' | 'payer' | 'visitType' | 'category')[]
}

const WEIGHTS = { doctor: 8, payer: 4, visitType: 2, category: 1 } as const

export function specificity(t: Pick<Tariff, 'doctorId' | 'payerId' | 'visitType' | 'patientCategory'>): number {
  return (t.doctorId ? WEIGHTS.doctor : 0) + (t.payerId ? WEIGHTS.payer : 0) + (t.visitType ? WEIGHTS.visitType : 0) + (t.patientCategory ? WEIGHTS.category : 0)
}

function matches(t: Tariff, q: PriceQuery, payer: string): boolean {
  return (
    t.status === 'approved' &&
    t.serviceId === q.serviceId &&
    t.validFrom <= q.date &&
    (!t.doctorId || t.doctorId === q.doctorId) &&
    (!t.payerId || t.payerId === payer) &&
    (!t.visitType || t.visitType === q.visitType) &&
    (!t.patientCategory || t.patientCategory === q.patientCategory)
  )
}

/** Best approved row for the query, or undefined. Highest specificity wins; then the latest validFrom. */
export function bestTariff(tariffs: Tariff[], q: PriceQuery, payer: string): Tariff | undefined {
  let best: Tariff | undefined
  for (const t of tariffs) {
    if (!matches(t, q, payer)) continue
    if (!best) {
      best = t
      continue
    }
    const d = specificity(t) - specificity(best)
    if (d > 0 || (d === 0 && t.validFrom > best.validFrom) || (d === 0 && t.validFrom === best.validFrom && t.createdAt > best.createdAt)) best = t
  }
  return best
}

const matchedFields = (t: Tariff): PriceResult['matchedOn'] =>
  [t.doctorId && 'doctor', t.payerId && 'payer', t.visitType && 'visitType', t.patientCategory && 'category'].filter(Boolean) as PriceResult['matchedOn']

const FIELD_WORDS: Record<PriceResult['matchedOn'][number], string> = { doctor: 'doctor', payer: 'payer', visitType: 'visit type', category: 'patient category' }

function describe(t: Tariff): string {
  const on = matchedFields(t).map((f) => FIELD_WORDS[f])
  return on.length ? `Rate for this ${on.join(' + ')}, valid from ${formatDay(t.validFrom)}` : `Rate for all patients, valid from ${formatDay(t.validFrom)}`
}

export function lookupPrice(q: PriceQuery, service: Service, tariffs: Tariff[], panel?: Panel | null): PriceResult {
  const isPanel = !!q.payerId && q.payerId !== 'cash'
  const payer = isPanel ? q.payerId! : 'cash'

  // Panel on "hospital tariff ± %": price as a cash patient, then adjust.
  if (isPanel && panel && panel.contract.rateBasis === 'hospitalTariff') {
    const own = bestTariff(tariffs, q, payer)
    // A row written specifically for this panel still wins.
    if (own?.payerId === payer) return { amountPaise: own.amountPaise, source: 'tariff', tariffId: own.id, explanation: describe(own), matchedOn: matchedFields(own) }
    const base = lookupPrice({ ...q, payerId: 'cash' }, service, tariffs)
    const pct = panel.contract.adjustPercent
    const amount = Math.round((base.amountPaise * (100 + pct)) / 100)
    return {
      amountPaise: amount,
      source: 'panelAdjusted',
      tariffId: base.tariffId,
      explanation: `${panel.name}: hospital price ${pct === 0 ? 'as is' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`} (${base.explanation.charAt(0).toLowerCase()}${base.explanation.slice(1)})`,
      matchedOn: base.matchedOn,
    }
  }

  const t = bestTariff(tariffs, q, payer)
  if (t) return { amountPaise: t.amountPaise, source: 'tariff', tariffId: t.id, explanation: describe(t), matchedOn: matchedFields(t) }
  return { amountPaise: service.defaultRatePaise, source: 'default', explanation: 'No matching tariff: the service’s default rate', matchedOn: [] }
}

/** The same combination (all five keys equal): the rows that are versions of one rate. */
export const sameCombination = (a: Tariff, b: Tariff) =>
  a.serviceId === b.serviceId && a.doctorId === b.doctorId && a.payerId === b.payerId && a.visitType === b.visitType && a.patientCategory === b.patientCategory

/** Day before a YYYY-MM-DD date. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
