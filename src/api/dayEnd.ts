/**
 * Day-end closing (OPD Spec screen 13). Wired to the real backend (Stage 6d).
 * 1. Each cashier counts the cash in the drawer and hands over: the closing covers every receipt
 *    they took that is not in an earlier submitted or accepted closing.
 * 2. Accounts accepts each closing (or sends it back to be counted again).
 * 3. Accounts closes the day once every receipt of the day is in an accepted closing. Open
 *    visits of that day are closed, no new payments can be taken on that date, and its bills
 *    can be cancelled only by someone with day-end approval (the refund goes into today).
 */
import type { CashClosing, ClosingInput, DayEndView, MyCounter } from '@/types/dayEnd'
import { request } from './client'

export function getMyCounter(): Promise<MyCounter> {
  return request('/opd/day-end/my-counter')
}

/** Count the drawer and hand over to Accounts. */
export function submitClosing(input: ClosingInput): Promise<CashClosing> {
  return request('/opd/day-end/closings', { method: 'POST', body: input })
}

/** Accounts: accept a handover, or send it back to be counted again (with a note). */
export function decideClosing(id: string, accept: boolean, note?: string): Promise<CashClosing> {
  return request(`/opd/day-end/closings/${id}/decide`, { method: 'POST', body: { accept, note } })
}

export function getDayEnd(date: string): Promise<DayEndView> {
  return request(`/opd/day-end/${date}`)
}

/** Close the day: every receipt of the day is in an accepted handover. Open visits are closed. */
export function closeDay(date: string): Promise<DayEndView> {
  return request(`/opd/day-end/${date}/close`, { method: 'POST' })
}

/** Undo a day close (a late payment or correction). Audited with the reason. */
export function reopenDay(date: string, reason: string): Promise<DayEndView> {
  return request(`/opd/day-end/${date}/reopen`, { method: 'POST', body: { reason } })
}

/** One handover (for its printed slip). Cashiers see only their own. */
export function getClosing(id: string): Promise<CashClosing & { clinicName: string }> {
  return request(`/opd/day-end/closings/${id}`)
}
