/**
 * Human numbers from per-clinic number series (UHID, visit, token, bill, receipt).
 * Financial-year series restart on 1 April; tokens restart daily per doctor.
 */
import type { DbShape, NumberSeries } from './db'

/** Indian financial year label of a YYYY-MM-DD date: 2026-11-22 → "2026-27". */
export function financialYear(ymd: string, startMonth = 4): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  const start = m >= startMonth ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

function series(db: DbShape, clinicId: string, key: string, base: Omit<NumberSeries, 'clinicId' | 'key' | 'next'>): NumberSeries {
  let s = db.numberSeries.find((x) => x.clinicId === clinicId && x.key === key)
  if (!s) {
    s = { clinicId, key, next: 1, ...base }
    db.numberSeries.push(s)
  }
  return s
}

function take(s: NumberSeries, period?: string): number {
  if (period && s.period !== period) {
    s.period = period
    s.next = 1
  }
  return s.next++
}

const pad = (n: number, w: number) => String(n).padStart(w, '0')

/** SUN-2026-000123 (OPD Spec default UHID format: prefix + year + running number). */
export function nextUhid(db: DbShape, clinicId: string, today: string): string {
  const prefix = db.clinics.find((c) => c.id === clinicId)?.uhidPrefix ?? 'HOSP'
  const s = series(db, clinicId, 'uhid', { prefix, reset: 'never' })
  return `${s.prefix}-${today.slice(0, 4)}-${pad(take(s), 6)}`
}

function fyNumber(db: DbShape, clinicId: string, key: 'visit' | 'bill' | 'receipt', prefix: string, today: string): string {
  const fyStart = db.clinics.find((c) => c.id === clinicId)?.financialYearStartMonth ?? 4
  const fy = financialYear(today, fyStart)
  const s = series(db, clinicId, key, { prefix, reset: 'financialYear' })
  return `${s.prefix}/${fy}/${pad(take(s, fy), 6)}`
}

export const nextVisitNo = (db: DbShape, clinicId: string, today: string) => fyNumber(db, clinicId, 'visit', 'OP', today)
export const nextBillNo = (db: DbShape, clinicId: string, today: string) => fyNumber(db, clinicId, 'bill', 'OPB', today)
export const nextReceiptNo = (db: DbShape, clinicId: string, today: string) => fyNumber(db, clinicId, 'receipt', 'RCP', today)

/** Token per doctor per day, from 1. */
export function nextToken(db: DbShape, clinicId: string, doctorId: string, today: string): number {
  const s = series(db, clinicId, `token:${doctorId}`, { prefix: '', reset: 'daily' })
  return take(s, today)
}

/** TMP-2026-0001: temporary UHID for an unidentified emergency patient (OPD-14). */
export function nextTempUhid(db: DbShape, clinicId: string, today: string): string {
  const s = series(db, clinicId, 'tmpUhid', { prefix: 'TMP', reset: 'never' })
  return `${s.prefix}-${today.slice(0, 4)}-${pad(take(s), 4)}`
}
