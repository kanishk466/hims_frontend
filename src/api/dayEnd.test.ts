import { describe, expect, it } from 'vitest'
import { todayIST, addDays } from '@/lib/dates'
import { loginAs } from '@/test/utils'
import { cancelBill, createBill, listBills, takePayment } from './billing'
import { checkIn } from './visits'
import { consultationServiceId } from '@/mock/seed/masters'
import { closeDay, decideClosing, getDayEnd, getMyCounter, reopenDay, submitClosing } from './dayEnd'

const today = todayIST()

/** Take a fresh cash payment today, so the test does not depend on the time of day. */
async function collect(patientId = 'pt-009') {
  const v = await checkIn({ patientId, doctorId: 'doc-arjun', visitType: 'new', payerId: 'cash', category: 'general' })
  const b = await createBill(v.id, { lines: [{ serviceId: consultationServiceId('clinic-sunrise'), qty: 1 }], discountPercent: 0 })
  await takePayment(b.id, { lines: [{ mode: 'cash', amountPaise: b.patientNetPaise }] })
}

/** Count the drawer exactly (in ₹100 notes + coins), optionally off by some paise. */
async function handOver(offPaise = 0, reason?: string) {
  const mine = await getMyCounter()
  const cash = mine.cashSystemPaise + offPaise
  const hundreds = Math.floor(cash / 10000)
  return submitClosing({ notes: { '100': hundreds }, coinsPaise: cash - hundreds * 10000, nonCash: [], reason })
}

describe('day-end closing', () => {
  it('past days are closed in the demo; today is open with the cashier’s receipts', async () => {
    await loginAs('cashier')
    await collect()
    const mine = await getMyCounter()
    expect(mine.receiptsCount).toBeGreaterThan(0)
    expect(mine.tolerancePaise).toBe(1000)
    await loginAs('accounts')
    const y = await getDayEnd(addDays(today, -2))
    expect(y.closed === null || y.closed.active).toBe(true)
  })

  it('a shortage above ₹10 needs a reason; within ₹10 it does not', async () => {
    await loginAs('cashier')
    await collect()
    await expect(handOver(-5000)).rejects.toMatchObject({ code: 'reason' })
    const c = await handOver(-500)
    expect(c.cashVariancePaise).toBe(-500)
    expect(c.status).toBe('submitted')
    expect((await getMyCounter()).receiptsCount).toBe(0)
  })

  it('Accounts accepts or sends back; a sent-back handover is counted again', async () => {
    await loginAs('cashier')
    await collect()
    const c = await handOver(-5000, 'Gave change from my own pocket')
    await expect(decideClosing(c.id, true)).rejects.toMatchObject({ status: 403 })
    await loginAs('accounts')
    await expect(decideClosing(c.id, false)).rejects.toMatchObject({ code: 'invalid' })
    await decideClosing(c.id, false, 'Count again with the supervisor')
    await loginAs('cashier')
    expect((await getMyCounter()).receiptsCount).toBeGreaterThan(0)
  })

  it('closes the day only when everything is handed over and accepted; then payments stop', async () => {
    await loginAs('cashier')
    await collect()
    const c = await handOver()
    await loginAs('accounts')
    let view = await getDayEnd(today)
    expect(view.blockers.join(' ')).toMatch(/waiting for acceptance/)
    await expect(closeDay(today)).rejects.toMatchObject({ code: 'blocked' })
    await decideClosing(c.id, true)
    view = await getDayEnd(today)
    expect(view.blockers).toEqual([])
    view = await closeDay(today)
    expect(view.closed?.closedByName).toBe('Kavita Shah')
    expect(view.openVisits).toBe(0)

    await loginAs('cashier')
    const unpaid = (await listBills()).rows.find((b) => b.status === 'unpaid' && !b.discountPending)
    if (unpaid) await expect(takePayment(unpaid.id, { lines: [{ mode: 'cash', amountPaise: unpaid.patientNetPaise }] })).rejects.toMatchObject({ code: 'day_closed' })

    await loginAs('accounts')
    await reopenDay(today, 'Late UPI payment to record')
    expect((await getDayEnd(today)).closed).toBeNull()
  })

  it('a bill from a closed day can be cancelled only by Accounts', async () => {
    await loginAs('admin')
    const old = (await listBills(addDays(today, -3))).rows.find((b) => b.status === 'paid')
    if (!old) return
    await loginAs('cashier')
    await expect(cancelBill(old.id, 'WRONG')).rejects.toMatchObject({ status: 403 })
    await loginAs('accounts')
    const cancelled = await cancelBill(old.id, 'WRONG')
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.receipts.some((r) => r.kind === 'refund' && r.at.slice(0, 10) >= addDays(today, -1))).toBe(true)
  })
})
