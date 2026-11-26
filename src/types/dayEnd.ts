/** Day-end closing (OPD Spec screen 13): cashier handover, Accounts acceptance, day close. */
import { z } from 'zod'
import type { IsoDateTime, Paise } from './common'

/** Notes counted at the counter (₹2000 notes are withdrawn from circulation). */
export const DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const
export type Denomination = (typeof DENOMINATIONS)[number]

export const closingInputSchema = z.object({
  /** Number of notes of each denomination, keyed by rupee value. */
  notes: z.record(z.string(), z.number().int().min(0, 'Count cannot be negative')),
  /** Coins and ₹1–5 notes, as one amount in paise. */
  coinsPaise: z.number().int().min(0),
  /** What the bank / terminal slip shows for each non-cash mode. */
  nonCash: z.array(z.object({ mode: z.string(), confirmedPaise: z.number().int() })),
  reason: z.string().trim().optional(),
})
export type ClosingInput = z.infer<typeof closingInputSchema>

export interface ModeTotal {
  mode: string
  label: string
  /** Payments minus refunds in this mode. */
  systemPaise: Paise
  count: number
}

export interface CashClosing {
  id: string
  clinicId: string
  /** Business date (IST) the closing was submitted on. */
  date: string
  cashierId: string
  cashierName: string
  /** First and last receipt covered. */
  from: IsoDateTime | null
  to: IsoDateTime
  receiptIds: string[]
  byMode: ModeTotal[]
  refundsPaise: Paise
  cashSystemPaise: Paise
  notes: Record<string, number>
  coinsPaise: Paise
  cashCountedPaise: Paise
  /** Counted − system (negative = shortage). */
  cashVariancePaise: Paise
  nonCash: { mode: string; label: string; systemPaise: Paise; confirmedPaise: Paise }[]
  reason?: string
  status: 'submitted' | 'accepted' | 'rejected'
  submittedAt: IsoDateTime
  decidedBy?: string
  decidedByName?: string
  decidedAt?: IsoDateTime
  rejectNote?: string
}

export interface DayClose {
  id: string
  clinicId: string
  date: string
  closedBy: string
  closedByName: string
  closedAt: IsoDateTime
  byMode: ModeTotal[]
  cashHandedOverPaise: Paise
  visitsClosed: number
  reopened?: { by: string; at: IsoDateTime; reason: string }[]
  /** False after "Reopen day" until it is closed again. */
  active: boolean
}

/** My counter: receipts not yet handed over. */
export interface MyCounter {
  receiptsCount: number
  from: IsoDateTime | null
  byMode: ModeTotal[]
  refundsPaise: Paise
  cashSystemPaise: Paise
  tolerancePaise: Paise
  /** The latest closings by me (rejected ones need a recount). */
  closings: CashClosing[]
  todayClosed: DayClose | null
}

export interface DayEndCashier {
  userId: string
  name: string
  /** Receipts on this date not yet in a submitted or accepted closing. */
  openPaise: Paise
  openCount: number
  closings: CashClosing[]
}

export interface DayEndView {
  date: string
  closed: DayClose | null
  cashiers: DayEndCashier[]
  byMode: ModeTotal[]
  refundsPaise: Paise
  bills: { count: number; grossPaise: Paise; discountPaise: Paise; panelPaise: Paise; cancelled: number; cancelledPaise: Paise }
  openVisits: number
  /** Why the day cannot be closed yet (empty = can close). */
  blockers: string[]
  printedAt: IsoDateTime
  clinicName: string
}
