/** Vitals helpers (OPD-06): BMI and out-of-range flags for the doctor. Adult ranges. */
import type { VitalsInput } from '@/types/opd'

export function bmi(weightKg?: number, heightCm?: number): number | undefined {
  if (!weightKg || !heightCm) return undefined
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

export interface VitalFlag {
  field: keyof VitalsInput | 'bmi'
  level: 'high' | 'low'
  text: string
}

type Range = { low?: number; high?: number; lowText: string; highText: string }
const RANGES: Partial<Record<keyof VitalsInput | 'bmi', Range>> = {
  bpSys: { low: 90, high: 140, lowText: 'Low BP', highText: 'High BP' },
  bpDia: { low: 60, high: 90, lowText: 'Low BP', highText: 'High BP' },
  pulse: { low: 60, high: 100, lowText: 'Slow pulse', highText: 'Fast pulse' },
  tempF: { low: 96, high: 99.5, lowText: 'Low temperature', highText: 'Fever' },
  spo2: { low: 95, lowText: 'Low oxygen', highText: '' },
  rr: { low: 12, high: 20, lowText: 'Slow breathing', highText: 'Fast breathing' },
  sugar: { low: 70, high: 180, lowText: 'Low sugar', highText: 'High sugar' },
  painScore: { high: 6, lowText: '', highText: 'Severe pain' },
  bmi: { low: 18.5, high: 25, lowText: 'Underweight', highText: 'Overweight' },
}

/** Adult ranges; for children under 12 only SpO₂, temperature and sugar are flagged. */
export function vitalFlags(v: Partial<VitalsInput> & { bmi?: number }, ageYears = 30): VitalFlag[] {
  const out: VitalFlag[] = []
  for (const [field, r] of Object.entries(RANGES) as [keyof typeof RANGES, Range][]) {
    if (ageYears < 12 && !['spo2', 'tempF', 'sugar'].includes(field)) continue
    const x = v[field as keyof typeof v] as number | undefined
    if (x === undefined || x === null) continue
    if (r.low !== undefined && x < r.low) out.push({ field, level: 'low', text: r.lowText })
    else if (r.high !== undefined && x > r.high) out.push({ field, level: 'high', text: r.highText })
  }
  return out
}
