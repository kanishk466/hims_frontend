import { describe, expect, it } from 'vitest'
import type { Panel, Service, Tariff } from '@/types/masters'
import { lookupPrice } from './pricing'

const service = { id: 'cons', defaultRatePaise: 50000 } as Service
let n = 0
const t = (amount: number, o: Partial<Tariff> = {}): Tariff =>
  ({ id: `t${++n}`, serviceId: 'cons', doctorId: null, payerId: null, visitType: null, patientCategory: null, amountPaise: amount * 100, validFrom: '2026-04-01', status: 'approved', createdAt: `2026-01-0${n % 9}`, ...o }) as Tariff

const tariffs = [
  t(400),
  t(600, { doctorId: 'drA' }),
  t(700, { doctorId: 'drA', validFrom: '2026-12-01' }),
  t(300, { doctorId: 'drA', visitType: 'followUp' }),
  t(350, { payerId: 'cghs' }),
  t(250, { patientCategory: 'senior' }),
  t(999, { doctorId: 'drA', status: 'pending' }),
]
const q = { serviceId: 'cons', date: '2026-11-22' }

describe('price lookup', () => {
  it('falls back to the service default when nothing matches', () => {
    expect(lookupPrice({ ...q, serviceId: 'cons' }, service, []).amountPaise).toBe(50000)
  })
  it('uses the general rate for any doctor', () => {
    expect(lookupPrice({ ...q, doctorId: 'drB' }, service, tariffs)).toMatchObject({ amountPaise: 40000, source: 'tariff', matchedOn: [] })
  })
  it('prefers the doctor-specific rate, and its visit-type rate over it', () => {
    expect(lookupPrice({ ...q, doctorId: 'drA', visitType: 'new' }, service, tariffs).amountPaise).toBe(60000)
    expect(lookupPrice({ ...q, doctorId: 'drA', visitType: 'followUp' }, service, tariffs)).toMatchObject({ amountPaise: 30000, matchedOn: ['doctor', 'visitType'] })
  })
  it('uses a new version only from its start date', () => {
    expect(lookupPrice({ ...q, doctorId: 'drA', date: '2026-11-30' }, service, tariffs).amountPaise).toBe(60000)
    expect(lookupPrice({ ...q, doctorId: 'drA', date: '2026-12-01' }, service, tariffs).amountPaise).toBe(70000)
  })
  it('ignores pending rates', () => {
    expect(lookupPrice({ ...q, doctorId: 'drA' }, service, tariffs).amountPaise).not.toBe(99900)
  })
  it('doctor (8) outranks payer (4) + visit type (2) + category (1)', () => {
    expect(lookupPrice({ ...q, doctorId: 'drA', payerId: 'cghs', patientCategory: 'senior' }, service, tariffs).amountPaise).toBe(60000)
    expect(lookupPrice({ ...q, doctorId: 'drB', payerId: 'cghs', patientCategory: 'senior' }, service, tariffs).amountPaise).toBe(35000)
  })
  it('applies hospital tariff ± % for panels on that basis', () => {
    const panel = { id: 'tpa', name: 'Medi Assist', contract: { rateBasis: 'hospitalTariff', adjustPercent: -10 } } as Panel
    const r = lookupPrice({ ...q, doctorId: 'drA', payerId: 'tpa' }, service, tariffs, panel)
    expect(r).toMatchObject({ amountPaise: 54000, source: 'panelAdjusted' })
    expect(r.explanation).toContain('−10%')
  })
})
