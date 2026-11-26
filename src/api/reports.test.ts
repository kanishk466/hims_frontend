import { describe, expect, it } from 'vitest'
import { addDays, todayIST } from '@/lib/dates'
import { _unloadDb, db } from '@/mock/db'
import { loginAs } from '@/test/utils'
import { REPORT_KEYS } from '@/types/reports'
import { getMdDashboard, runReport } from './reports'

const today = todayIST()
const month = { from: addDays(today, -29), to: today }
const n = (v: unknown) => Number(v)

describe('OPD reports', () => {
  it('every report runs for the MD over 30 days and has rows', async () => {
    await loginAs('md')
    for (const key of REPORT_KEYS) {
      const r = await runReport(key, month)
      expect(r.tiles.length).toBeGreaterThan(0)
      expect(r.rows.length, key).toBeGreaterThan(0)
    }
  })

  it('footfall matches a hand count of the visits', async () => {
    await loginAs('admin')
    const r = await runReport('footfall', month)
    _unloadDb()
    const expected = db().visits.filter((v) => v.clinicId === 'clinic-sunrise' && v.date >= month.from && v.date <= month.to && !['cancelled', 'noShow'].includes(v.status)).length
    expect(r.tiles[0]!.value).toBe(expected)
    expect(n(r.totals!.total)).toBe(expected)
    const one = await runReport('footfall', { ...month, doctorId: 'doc-meera' })
    expect(one.rows.every((x) => x.doctor === 'Dr. Meera Iyer')).toBe(true)
  })

  it('collection equals the receipts of the period, net of refunds', async () => {
    await loginAs('accounts')
    const r = await runReport('collection', month)
    _unloadDb()
    const expected = db().receipts.filter((x) => x.clinicId === 'clinic-sunrise' && todayIST(new Date(x.at)) >= month.from && todayIST(new Date(x.at)) <= month.to).reduce((t, x) => t + x.totalPaise, 0)
    expect(r.tiles[0]!.value).toBe(expected)
    expect(r.rows.map((x) => x.cashier)).toContain('Rahul Kamble')
  })

  it('each report has its own permission', async () => {
    await loginAs('accounts')
    await expect(runReport('diagnoses', month)).rejects.toMatchObject({ status: 403 })
    await loginAs('nurse')
    await expect(runReport('footfall', month)).rejects.toMatchObject({ status: 403 })
    await loginAs('doctor')
    expect((await runReport('diagnoses', month)).rows[0]!.code).toBeTruthy()
  })

  it('rejects a reversed or too long range', async () => {
    await loginAs('md')
    await expect(runReport('footfall', { from: today, to: addDays(today, -1) })).rejects.toMatchObject({ code: 'invalid' })
    await expect(runReport('footfall', { from: '2024-01-01', to: today })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('discounts list who asked and who approved; waiting time has sensible numbers', async () => {
    await loginAs('md')
    const d = await runReport('discounts', { from: addDays(today, -89), to: today })
    expect(d.rows.some((x) => x.type === 'Discount' && x.approvedBy && x.approvedBy !== 'Within limit')).toBe(true)
    expect(d.rows.some((x) => x.type === 'Cancelled bill')).toBe(true)
    const w = await runReport('waitingTime', month)
    expect(w.tiles[0]!.value).toBeGreaterThan(2)
    expect(w.tiles[0]!.value).toBeLessThan(60)
  })
})

describe('MD dashboard', () => {
  it('gives today, live doctor load and a 30-day trend', async () => {
    await loginAs('md')
    const m = await getMdDashboard()
    expect(m.trend).toHaveLength(30)
    expect(m.trend.slice(0, 29).some((t) => t.patients > 0)).toBe(true)
    expect(m.payerMix.length).toBeGreaterThan(0)
    expect(m.topDiagnoses.length).toBe(5)
    await loginAs('cashier')
    await expect(getMdDashboard()).rejects.toMatchObject({ status: 403 })
  })
})
