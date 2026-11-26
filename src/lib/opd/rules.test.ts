import { visitFlow } from './flow'
import { describe, expect, it } from 'vitest'
import type { Panel } from '@/types/masters'
import { changeDue, checkDiscount, splitLines } from './billSplit'
import { rxAlerts, rxQuantity } from './rx'
import { slotTimes, weekdayOf } from './slots'
import { suggestVisitType } from './visitType'
import { bmi, vitalFlags } from './vitals'

const rule = { freeDays: 7, followUpDays: 30, freeAllowed: 1 }
const v = (date: string, visitType = 'new', doctorId = 'drA', status = 'completed') => ({ date, visitType, doctorId, status })

describe('visit type at check-in', () => {
  it('new when never seen by this doctor', () => {
    expect(suggestVisitType([v('2026-11-20', 'new', 'drB')], 'drA', '2026-11-22', rule).visitType).toBe('new')
  })
  it('free follow-up within 7 days of a paid visit, once', () => {
    expect(suggestVisitType([v('2026-11-17')], 'drA', '2026-11-22', rule).visitType).toBe('freeFollowUp')
    expect(suggestVisitType([v('2026-11-17'), v('2026-11-19', 'freeFollowUp')], 'drA', '2026-11-22', rule)).toMatchObject({
      visitType: 'followUp',
      reason: expect.stringContaining('free follow-up already used'),
    })
  })
  it('paid follow-up between 8 and 30 days, new after that', () => {
    expect(suggestVisitType([v('2026-11-02')], 'drA', '2026-11-22', rule).visitType).toBe('followUp')
    expect(suggestVisitType([v('2026-10-01')], 'drA', '2026-11-22', rule).visitType).toBe('new')
  })
  it('ignores cancelled and no-show visits', () => {
    expect(suggestVisitType([v('2026-11-20', 'new', 'drA', 'cancelled')], 'drA', '2026-11-22', rule).visitType).toBe('new')
  })
})

const panel = (c: Partial<Panel['coverage']>) => ({ coverage: { copayPercent: 0, copayFixedPaise: 0, excludedGroups: [], perVisitCapPaise: 0, ...c } }) as Pick<Panel, 'coverage'>

describe('panel split', () => {
  const lines = [
    { amountPaise: 50000, group: 'consultation' },
    { amountPaise: 35000, group: 'investigation' },
    { amountPaise: 149900, group: 'package' },
  ]
  it('cash patients pay everything', () => {
    expect(splitLines(lines, null).map((l) => l.patientPaise)).toEqual([50000, 35000, 149900])
  })
  it('co-pay % and excluded groups', () => {
    const r = splitLines(lines, panel({ copayPercent: 10, excludedGroups: ['package'] }))
    expect(r).toEqual([
      { panelPaise: 45000, patientPaise: 5000 },
      { panelPaise: 31500, patientPaise: 3500 },
      { panelPaise: 0, patientPaise: 149900 },
    ])
  })
  it('fixed co-pay per visit and a per-visit cap', () => {
    const r = splitLines(lines.slice(0, 2), panel({ copayFixedPaise: 10000, perVisitCapPaise: 50000 }))
    expect(r.reduce((s, l) => s + l.panelPaise, 0)).toBe(50000)
    expect(r.reduce((s, l) => s + l.patientPaise, 0)).toBe(35000)
    expect(r[0]!.patientPaise).toBe(10000)
  })
  it('discount above the limit needs approval; change for cash', () => {
    expect(checkDiscount(50000, 10, 0)).toEqual({ amountPaise: 5000, needsApproval: true })
    expect(checkDiscount(50000, 10, 20).needsApproval).toBe(false)
    expect(changeDue(50000, 45000)).toBe(5000)
  })
})

describe('slots', () => {
  it('splits a session into slot times and keeps the walk-in quota free', () => {
    expect(slotTimes({ start: '10:00', end: '11:00', slotMinutes: 15 })).toEqual(['10:00', '10:15', '10:30', '10:45'])
    expect(slotTimes({ start: '10:00', end: '13:00', slotMinutes: 10, maxPatients: 12, walkInQuota: 4 })).toHaveLength(8)
    expect(weekdayOf('2026-11-22')).toBe(0) // Sunday
  })
})

describe('vitals', () => {
  it('calculates BMI and flags out-of-range values', () => {
    expect(bmi(70, 170)).toBe(24.2)
    const flags = vitalFlags({ bpSys: 160, bpDia: 100, tempF: 101.2, spo2: 98, bmi: 27 })
    expect(flags.map((f) => f.text)).toEqual(['High BP', 'High BP', 'Fever', 'Overweight'])
    expect(vitalFlags({ pulse: 120 }, 4)).toEqual([])
  })
})

describe('prescription', () => {
  it('quantity = dose × doses per day × days, tablets only', () => {
    expect(rxQuantity({ form: 'TABLET', dose: '1', duration: 5, durationUnit: 'D' }, 3)).toBe(15)
    expect(rxQuantity({ form: 'TABLET', dose: '1', duration: 1, durationUnit: 'W' }, 2)).toBe(14)
    expect(rxQuantity({ form: 'SYRUP', dose: '5 ml', duration: 5, durationUnit: 'D' }, 3)).toBeUndefined()
  })
  it('allergy, high-alert and duplicate generic alerts', () => {
    const items = [
      { drugId: 'a', brand: 'Augmentin 625 Duo', generic: 'Amoxicillin + Clavulanic acid' },
      { drugId: 'b', brand: 'Dolo 650', generic: 'Paracetamol' },
      { drugId: 'c', brand: 'Crocin Advance', generic: 'Paracetamol' },
      { drugId: 'd', brand: 'Lantus', generic: 'Insulin glargine' },
    ]
    const alerts = rxAlerts(items, ['PEN'], (id) => (id === 'd' ? { highAlert: true } : { drugClass: 'Antibiotic' }))
    expect(alerts.map((a) => a.kind).sort()).toEqual(['allergy', 'duplicate', 'highAlert'])
  })
})

describe('visit flow strip', () => {
  const base = { status: 'checkedIn' as const, token: '7', consultPaid: false, waiveConsultation: false, hasVitals: false, pendingCharges: 0 }
  const states = (v: Parameters<typeof visitFlow>[0]) => visitFlow(v).map((s) => `${s.key}:${s.state}`).join(' ')

  it('points at payment after check-in, then vitals, then the doctor', () => {
    expect(states(base)).toBe('register:done checkin:done pay:current vitals:todo doctor:todo done:todo')
    expect(states({ ...base, status: 'billed', consultPaid: true })).toContain('vitals:current')
    expect(states({ ...base, status: 'vitalsDone', consultPaid: true, hasVitals: true })).toContain('doctor:current')
  })

  it('marks skipped vitals once the doctor has the patient, and tests still to bill', () => {
    const s = visitFlow({ ...base, status: 'completed', consultPaid: true, pendingCharges: 2 })
    expect(s.find((x) => x.key === 'vitals')!.state).toBe('skipped')
    expect(s.find((x) => x.key === 'done')).toMatchObject({ state: 'current', note: '2 tests to bill' })
  })

  it('greys out the rest of a cancelled visit', () => {
    expect(states({ ...base, status: 'cancelled' })).toBe('register:done checkin:done pay:skipped vitals:skipped doctor:skipped done:skipped')
  })
})
