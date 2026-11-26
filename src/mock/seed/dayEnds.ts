/**
 * Past days are handed over and closed (as they would be in a running hospital): one accepted
 * closing per cashier per day, accepted by Accounts, and a day close. Today stays open, so the
 * cashier has a drawer to count in the demo.
 */
import { todayIST } from '@/lib/dates'
import type { CashClosing, ModeTotal } from '@/types/dayEnd'
import type { DbShape } from '../db'

export function seedDayEnds(db: DbShape, clinicId: string, now: Date) {
  const today = todayIST(now)
  const accounts = db.users.find((u) => u.id === 'user-accounts')
  if (!accounts) return
  const label = (mode: string) => db.valueListItems.find((v) => v.clinicId === clinicId && v.type === 'paymentMode' && v.code === mode)?.label ?? mode
  const byDate = new Map<string, typeof db.receipts>()
  for (const r of db.receipts) {
    if (r.clinicId !== clinicId) continue
    const d = todayIST(new Date(r.at))
    if (d >= today) continue
    byDate.set(d, [...(byDate.get(d) ?? []), r])
  }
  for (const [date, receipts] of [...byDate.entries()].sort()) {
    const closeAt = new Date(`${date}T15:30:00Z`).toISOString() // 9 pm IST
    const totals: ModeTotal[] = []
    for (const cashierId of [...new Set(receipts.map((r) => r.receivedBy))]) {
      const mine = receipts.filter((r) => r.receivedBy === cashierId).sort((a, b) => a.at.localeCompare(b.at))
      const map = new Map<string, ModeTotal>()
      let refunds = 0
      for (const r of mine) {
        if (r.kind === 'refund') refunds += -r.totalPaise
        for (const l of r.lines) {
          const m = map.get(l.mode) ?? { mode: l.mode, label: label(l.mode), systemPaise: 0, count: 0 }
          m.systemPaise += l.amountPaise
          m.count++
          map.set(l.mode, m)
        }
      }
      const byMode = [...map.values()].sort((a, b) => (a.mode === 'cash' ? -1 : b.mode === 'cash' ? 1 : b.systemPaise - a.systemPaise))
      const cash = map.get('cash')?.systemPaise ?? 0
      // Count the cash as notes: hundreds, then the rest in coins.
      const hundreds = Math.floor(cash / 10000)
      const c: CashClosing = {
        id: `cls-${date}-${cashierId}`,
        clinicId,
        date,
        cashierId,
        cashierName: mine[0]!.receivedByName,
        from: mine[0]!.at,
        to: closeAt,
        receiptIds: mine.map((r) => r.id),
        byMode,
        refundsPaise: refunds,
        cashSystemPaise: cash,
        notes: { '500': 0, '200': 0, '100': Math.max(0, hundreds), '50': 0, '20': 0, '10': 0 },
        coinsPaise: Math.max(0, cash - hundreds * 10000),
        cashCountedPaise: cash,
        cashVariancePaise: 0,
        nonCash: byMode.filter((m) => m.mode !== 'cash').map((m) => ({ mode: m.mode, label: m.label, systemPaise: m.systemPaise, confirmedPaise: m.systemPaise })),
        status: 'accepted',
        submittedAt: closeAt,
        decidedBy: accounts.id,
        decidedByName: accounts.name,
        decidedAt: closeAt,
      }
      db.cashClosings.push(c)
      for (const m of byMode) {
        const t = totals.find((x) => x.mode === m.mode)
        if (t) {
          t.systemPaise += m.systemPaise
          t.count += m.count
        } else totals.push({ ...m })
      }
    }
    db.dayCloses.push({
      id: `day-${clinicId}-${date}`,
      clinicId,
      date,
      closedBy: accounts.id,
      closedByName: accounts.name,
      closedAt: closeAt,
      byMode: totals,
      cashHandedOverPaise: totals.find((t) => t.mode === 'cash')?.systemPaise ?? 0,
      visitsClosed: 0,
      active: true,
    })
  }
}
