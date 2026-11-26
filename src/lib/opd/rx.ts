/** e-Prescription helpers (OPD-08): quantity, allergy and duplicate alerts, Hindi lines. */
import type { RxItem } from '@/types/opd'

const DURATION_DAYS = { D: 1, W: 7, M: 30 } as const

/** Tablets/capsules to dispense: doses per day × days (SOS and liquids: none). */
export function rxQuantity(item: Pick<RxItem, 'form' | 'dose' | 'duration' | 'durationUnit'>, perDay: number): number | undefined {
  if (!['TABLET', 'CAPSULE'].includes(item.form) || perDay <= 0) return undefined
  const dose = Number.parseFloat(item.dose) || 1
  return Math.ceil(dose * perDay * item.duration * DURATION_DAYS[item.durationUnit])
}

/** Allergy code (value list "allergy") → words that, in a drug's generic or class, mean danger. */
const ALLERGY_MATCH: Record<string, string[]> = {
  PEN: ['penicillin', 'amoxicillin', 'ampicillin', 'cloxacillin'],
  SULFA: ['sulfa', 'sulpha', 'cotrimoxazole', 'sulfamethoxazole'],
  NSAID: ['nsaid', 'ibuprofen', 'diclofenac', 'aceclofenac', 'mefenamic', 'naproxen', 'aspirin'],
  ASPIRIN: ['aspirin'],
}

export interface RxAlert {
  drugId: string
  kind: 'allergy' | 'duplicate' | 'highAlert'
  text: string
}

export function rxAlerts(
  items: Pick<RxItem, 'drugId' | 'brand' | 'generic'>[],
  allergyCodes: string[],
  drugInfo: (drugId: string) => { drugClass?: string; highAlert?: boolean } | undefined,
): RxAlert[] {
  const out: RxAlert[] = []
  for (const it of items) {
    const info = drugInfo(it.drugId)
    const hay = `${it.generic} ${info?.drugClass ?? ''}`.toLowerCase()
    for (const code of allergyCodes) {
      if ((ALLERGY_MATCH[code] ?? []).some((w) => hay.includes(w))) out.push({ drugId: it.drugId, kind: 'allergy', text: `${it.brand}: patient is allergic (${code})` })
    }
    if (info?.highAlert) out.push({ drugId: it.drugId, kind: 'highAlert', text: `${it.brand} is a high-alert drug: check dose` })
  }
  const seen = new Map<string, string>()
  for (const it of items) {
    const g = it.generic.toLowerCase()
    const prev = seen.get(g)
    if (prev) out.push({ drugId: it.drugId, kind: 'duplicate', text: `${it.brand} and ${prev} have the same generic (${it.generic})` })
    else seen.set(g, it.brand)
  }
  return out
}

/** Hindi lines for the printed prescription (OPD Spec default: English + Hindi). */
export const TIMING_HI: Record<string, string> = { AF: 'खाने के बाद', BF: 'खाने से पहले', WF: 'खाने के साथ', ES: 'खाली पेट', BT: 'सोते समय' }
export const FREQUENCY_HI: Record<string, string> = {
  OD: 'दिन में एक बार',
  BD: 'दिन में दो बार',
  TDS: 'दिन में तीन बार',
  QID: 'दिन में चार बार',
  HS: 'रात को सोते समय',
  SOS: 'ज़रूरत पड़ने पर',
  '1-0-1': 'सुबह और रात',
  '1-1-1': 'सुबह, दोपहर और रात',
  '1-0-0': 'सुबह',
  '0-0-1': 'रात',
  WEEKLY: 'हफ़्ते में एक बार',
}
