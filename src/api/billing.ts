/**
 * OPD billing counter (OPD-05): fee from tariff, pending orders, panel split, discount
 * with approval above the user's limit, cash/UPI/card/split payments, receipts,
 * cancellation with reason (bill never deleted). Wired to the real backend (Stage 6d).
 */
import { todayIST } from '@/lib/dates'
import type { SupervisorPinInput } from '@/types/auth'
import type { Bill, BillDraftLine, BillLine, BillView, PaymentInput, Receipt, VisitRow } from '@/types/opd'
import { request } from './client'

export interface BillingContext {
  visit: VisitRow
  suggested: BillDraftLine[]
  categoryDiscountPercent: number
  categoryLabel: string
  myDiscountLimit: number
  panel: { name: string; copayPercent: number; excluded: string[]; capPaise: number } | null
  bills: BillView[]
  paymentTiming: 'before' | 'after'
  upiId: string
}

export function getBillingContext(visitId: string): Promise<BillingContext> {
  return request(`/opd/billing/visits/${visitId}/context`)
}

export interface BillDraft {
  lines: BillDraftLine[]
  discountPercent: number
  discountReason?: string
  /** A supervisor's PIN, in place of leaving the discount pending for later approval. */
  supervisorOverride?: SupervisorPinInput
}

export interface BillPreview {
  lines: BillLine[]
  grossPaise: number
  panelPaise: number
  patientGrossPaise: number
  discountPaise: number
  patientNetPaise: number
  discountNeedsApproval: boolean
}

/** Live totals while the cashier builds the bill (nothing saved). */
export function previewBill(visitId: string, draft: BillDraft): Promise<BillPreview> {
  return request(`/opd/billing/visits/${visitId}/preview`, { method: 'POST', body: draft })
}

export function createBill(visitId: string, draft: BillDraft): Promise<BillView> {
  return request(`/opd/billing/visits/${visitId}`, { method: 'POST', body: draft })
}

/** Approve or reject a discount above the requester's limit (OPD-05). */
export function decideDiscount(billId: string, approve: boolean): Promise<BillView> {
  return request(`/opd/billing/${billId}/discount`, { method: 'POST', body: { approve } })
}

export function takePayment(billId: string, input: PaymentInput): Promise<Receipt> {
  return request(`/opd/billing/${billId}/payment`, { method: 'POST', body: input })
}

/**
 * Cancel with a reason (OPD-05): the bill stays, marked cancelled; a paid bill gets a
 * refund receipt. Same day only, unless the user is a Clinic Admin.
 */
export function cancelBill(billId: string, reason: string): Promise<BillView> {
  return request(`/opd/billing/${billId}/cancel`, { method: 'POST', body: { reason } })
}

export function getBill(id: string): Promise<BillView> {
  return request(`/opd/billing/${id}`)
}

export interface BillListRow {
  id: string
  billNo: string
  visitId: string
  patientName: string
  uhid: string
  doctorName: string
  grossPaise: number
  patientNetPaise: number
  panelPaise: number
  paidPaise: number
  status: Bill['status']
  discountPending: boolean
  discountPercent: number
  createdAt: string
  createdByName: string
  modes: string[]
}

/** A day's bills (newest first), with collection totals by payment mode. */
export function listBills(date = todayIST()): Promise<{ rows: BillListRow[]; collectedByMode: Record<string, number>; pendingApprovals: number }> {
  return request(`/opd/billing?date=${date}`)
}

export function findBillByNo(billNo: string): Promise<BillView> {
  return request(`/opd/billing/by-no?billNo=${encodeURIComponent(billNo)}`)
}
