/** HTTP-shaped twin of src/api/billing.ts's old mock logic (Stage 6d). */
import { http, type HttpHandler } from 'msw'
import { todayIST } from '@/lib/dates'
import { checkDiscount, splitLines } from '@/lib/opd/billSplit'
import { resolvePermissions } from '@/auth/resolve'
import { hashPassword } from '@/mock/password'
import { nextBillNo, nextReceiptNo } from '@/mock/numbers'
import type { SupervisorPinInput, User } from '@/types/auth'
import type { Bill, BillDraftLine, BillLine, Receipt, Visit } from '@/types/opd'
import { paymentInputSchema } from '@/types/opd'
import { ApiError } from '@/api/client'
import { findInClinic, nowIso, notFound, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { activeDayClose, brief, consultServiceOf, label, payerName, priceFor, settingsOf, toRow } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

/** Highest discount % a user may give without approval (max over their active roles). */
function discountLimitOf(ctx: RequestContext, user: Pick<User, 'roleIds'>): number {
  const roles = ctx.db.roles.filter((r) => user.roleIds.includes(r.id) && r.active)
  return Math.max(0, ...roles.map((r) => r.discountLimitPercent ?? 0))
}
const myLimit = (ctx: RequestContext) => discountLimitOf(ctx, ctx.user)

/**
 * A supervisor's PIN, typed at the counter, approves a discount above the cashier's own
 * limit on the spot (OPD-05) — the alternative to leaving the bill pending for later approval.
 */
function verifySupervisorOverride(ctx: RequestContext, pct: number, input: SupervisorPinInput): { id: string; name: string } {
  const clinicId = requireClinic(ctx)
  const username = input.username.trim()
  const supervisor = ctx.db.users.find((u) => u.clinicId === clinicId && u.username === username && u.status === 'active')
  if (!supervisor?.pinHash || supervisor.pinHash !== hashPassword(supervisor.id, input.pin.trim())) {
    throw new ApiError(401, 'invalid', 'Incorrect username or PIN.', { pin: 'Incorrect username or PIN' })
  }
  if (supervisor.id === ctx.user.id) throw new ApiError(403, 'self', 'You cannot approve your own discount with your own PIN.', { pin: 'Ask someone else to approve' })
  const roles = ctx.db.roles.filter((r) => r.clinicId === clinicId)
  if (!new Set(resolvePermissions(supervisor, roles)).has('opd.billing.approve')) {
    throw new ApiError(403, 'forbidden', `${supervisor.name} cannot approve discounts.`, { pin: `${supervisor.name} cannot approve discounts` })
  }
  const limit = discountLimitOf(ctx, supervisor)
  if (pct > limit) throw new ApiError(403, 'limit', `${supervisor.name}’s limit is ${limit}%.`, { pin: `${supervisor.name}’s limit is ${limit}%` })
  return { id: supervisor.id, name: supervisor.name }
}

function categoryDiscount(ctx: RequestContext, category: string): { percent: number; label: string } {
  const item = ctx.db.valueListItems.find((v) => v.clinicId === ctx.clinicId && v.type === 'patientCategory' && v.code === category)
  return { percent: Number(item?.meta.discountPercent ?? 0), label: item?.label ?? category }
}

function consultationDue(ctx: RequestContext, v: Visit): boolean {
  if (v.consultPaid || v.waiveConsultation) return false
  const cons = consultServiceOf(v.clinicId)
  return !ctx.db.bills.some((b) => b.visitId === v.id && b.status !== 'cancelled' && b.lines.some((l) => l.serviceId === cons))
}

interface BillDraftInput {
  lines: BillDraftLine[]
  discountPercent: number
  discountReason?: string
  supervisorOverride?: SupervisorPinInput
}

interface BillPreview {
  lines: BillLine[]
  grossPaise: number
  panelPaise: number
  patientGrossPaise: number
  discountPaise: number
  patientNetPaise: number
  discountNeedsApproval: boolean
}

function compute(ctx: RequestContext, v: Visit, draft: BillDraftInput): BillPreview {
  if (!draft.lines.length) throw new ApiError(400, 'invalid', 'Add at least one service.')
  const panel = v.payerId !== 'cash' ? (ctx.db.panels.find((p) => p.id === v.payerId) ?? null) : null
  const priced = draft.lines.map((d) => {
    const s = ctx.db.services.find((x) => x.id === d.serviceId && x.clinicId === v.clinicId && x.active)
    if (!s) throw new ApiError(400, 'invalid', 'A service on the bill is not available.')
    const qty = Math.max(1, Math.floor(d.qty || 1))
    let rate: number
    let note: string
    if (s.openPrice && d.ratePaise !== undefined) {
      if (d.ratePaise < 0) throw new ApiError(400, 'invalid', 'Rate cannot be negative.')
      rate = d.ratePaise
      note = 'Open price entered at the counter'
    } else {
      const p = priceFor(ctx.db, v, s.id)
      rate = p.amountPaise
      note = p.explanation
    }
    if (d.orderId && !ctx.db.orders.some((o) => o.id === d.orderId && o.visitId === v.id && o.status === 'ordered')) throw new ApiError(409, 'order', `${s.name} was already billed or cancelled.`)
    return { s, qty, rate, note, orderId: d.orderId }
  })
  const split = splitLines(
    priced.map((p) => ({ amountPaise: p.rate * p.qty, group: p.s.group })),
    panel,
  )
  const lines: BillLine[] = priced.map((p, i) => ({
    id: crypto.randomUUID(),
    serviceId: p.s.id,
    code: p.s.code,
    name: p.s.id === consultServiceOf(v.clinicId) ? `Consultation – ${ctx.db.doctors.find((d) => d.id === v.doctorId)?.name} (${label(ctx.db, v.clinicId, 'visitType', v.visitType)})` : p.s.name,
    group: p.s.group,
    qty: p.qty,
    ratePaise: p.rate,
    amountPaise: p.rate * p.qty,
    panelPaise: split[i]!.panelPaise,
    patientPaise: split[i]!.patientPaise,
    orderId: p.orderId,
    priceNote: p.note,
  }))
  const grossPaise = lines.reduce((s, l) => s + l.amountPaise, 0)
  const panelPaise = lines.reduce((s, l) => s + l.panelPaise, 0)
  const patientGrossPaise = grossPaise - panelPaise
  const pct = Math.min(100, Math.max(0, draft.discountPercent || 0))
  const cat = categoryDiscount(ctx, v.category)
  const d = checkDiscount(patientGrossPaise, pct, Math.max(myLimit(ctx), cat.percent))
  return { lines, grossPaise, panelPaise, patientGrossPaise, discountPaise: d.amountPaise, patientNetPaise: patientGrossPaise - d.amountPaise, discountNeedsApproval: pct > 0 && d.needsApproval }
}

function markPaid(ctx: RequestContext, bill: Bill) {
  bill.status = 'paid'
  const v = ctx.db.visits.find((x) => x.id === bill.visitId)!
  for (const l of bill.lines) {
    if (l.orderId) {
      const o = ctx.db.orders.find((x) => x.id === l.orderId)
      if (o) {
        o.status = 'billed'
        o.billId = bill.id
      }
    }
  }
  if (bill.lines.some((l) => l.serviceId === consultServiceOf(v.clinicId))) v.consultPaid = true
  if (v.status === 'checkedIn') {
    v.status = 'billed'
    v.history.push({ at: nowIso(), by: ctx.user.name, action: `Billed ${bill.billNo}` })
  }
}

function view(ctx: RequestContext, b: Bill) {
  const v = ctx.db.visits.find((x) => x.id === b.visitId)!
  const p = ctx.db.patients.find((x) => x.id === b.patientId)!
  return {
    ...b,
    patient: brief(ctx.db, p),
    visit: {
      visitNo: v.visitNo,
      tokenNo: v.tokenNo,
      token: v.token,
      mlc: v.mlc,
      date: v.date,
      visitType: v.visitType,
      doctorName: ctx.db.doctors.find((d) => d.id === v.doctorId)?.name ?? '?',
      visitTypeLabel: label(ctx.db, v.clinicId, 'visitType', v.visitType),
    },
    payerName: payerName(ctx.db, b.payerId),
    receipts: ctx.db.receipts.filter((r) => r.billId === b.id).sort((a, c) => a.at.localeCompare(c.at)),
  }
}

/** Blocks new payments once the day has been closed (Stage 3c's day-end). */
function assertDayOpen(ctx: RequestContext, clinicId: string, date = todayIST()) {
  const closed = activeDayClose(ctx.db, clinicId, date)
  if (closed) throw new ApiError(409, 'day_closed', `The day-end for today was closed by ${closed.closedByName}. New payments cannot be taken until Accounts reopens the day.`)
}

/** A bill of a closed day can be cancelled only by someone who approves day-ends. */
function assertCanTouchBillDay(ctx: RequestContext, billCreatedAt: string) {
  const date = todayIST(new Date(billCreatedAt))
  const closed = activeDayClose(ctx.db, requireClinic(ctx), date)
  if (closed && !ctx.permissions.has('opd.dayEnd.approve')) {
    throw new ApiError(403, 'day_closed', `This bill is from ${date}, which is closed. Only Accounts can cancel it; the refund goes into today's cash.`)
  }
}

export const billingHandlers: HttpHandler[] = [
  http.get(url('/opd/billing/visits/:visitId/context'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.view')
      const visitId = params.visitId as string
      const v = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      const suggested: BillDraftLine[] = []
      if (consultationDue(ctx, v)) suggested.push({ serviceId: consultServiceOf(v.clinicId), qty: 1 })
      for (const o of ctx.db.orders.filter((x) => x.visitId === visitId && x.status === 'ordered')) suggested.push({ serviceId: o.serviceId, qty: 1, orderId: o.id })
      const panel = v.payerId !== 'cash' ? ctx.db.panels.find((p) => p.id === v.payerId) : undefined
      const cat = categoryDiscount(ctx, v.category)
      const settings = settingsOf(ctx.db, v.clinicId)
      return {
        visit: toRow(ctx.db, v),
        suggested,
        categoryDiscountPercent: cat.percent,
        categoryLabel: cat.label,
        myDiscountLimit: myLimit(ctx),
        panel: panel ? { name: panel.name, copayPercent: panel.coverage.copayPercent, excluded: panel.coverage.excludedGroups, capPaise: panel.coverage.perVisitCapPaise } : null,
        bills: ctx.db.bills
          .filter((b) => b.visitId === visitId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((b) => view(ctx, b)),
        paymentTiming: settings.paymentTiming,
        upiId: settings.upiId,
      }
    }),
  ),

  http.post(url('/opd/billing/visits/:visitId/preview'), async ({ request, params }) => {
    const raw = (await request.json()) as BillDraftInput
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.view')
      return compute(ctx, findInClinic(ctx.db.visits, ctx, params.visitId as string, 'Visit'), raw)
    })
  }),

  http.post(url('/opd/billing/visits/:visitId'), async ({ request, params }) => {
    const draft = (await request.json()) as BillDraftInput
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.create')
      const visitId = params.visitId as string
      const v = findInClinic(ctx.db.visits, ctx, visitId, 'Visit')
      if (['cancelled', 'noShow'].includes(v.status)) throw new ApiError(409, 'state', 'This visit is cancelled.')
      const c = compute(ctx, v, draft)
      if (c.discountPaise > 0 && !draft.discountReason) throw new ApiError(400, 'invalid', 'Choose a discount reason.', { discountReason: 'Choose a reason' })
      if (draft.lines.some((l) => l.serviceId === consultServiceOf(v.clinicId)) && !consultationDue(ctx, v)) throw new ApiError(409, 'duplicate', 'The consultation is already billed for this visit.')
      const override = c.discountNeedsApproval && draft.supervisorOverride ? verifySupervisorOverride(ctx, draft.discountPercent, draft.supervisorOverride) : null
      const at = nowIso()
      const bill: Bill = {
        id: crypto.randomUUID(),
        clinicId: v.clinicId,
        billNo: nextBillNo(ctx.db, v.clinicId, todayIST()),
        visitId,
        patientId: v.patientId,
        payerId: v.payerId,
        lines: c.lines,
        grossPaise: c.grossPaise,
        panelPaise: c.panelPaise,
        patientGrossPaise: c.patientGrossPaise,
        discount:
          c.discountPaise > 0
            ? {
                percent: draft.discountPercent,
                amountPaise: c.discountPaise,
                reason: draft.discountReason!,
                status: override ? 'approved' : c.discountNeedsApproval ? 'pending' : 'auto',
                requestedBy: ctx.user.id,
                requestedByName: ctx.user.name,
                ...(override ? { decidedBy: override.id, decidedByName: override.name, decidedAt: at } : {}),
              }
            : null,
        patientNetPaise: c.discountNeedsApproval && !override ? c.patientGrossPaise : c.patientNetPaise,
        paidPaise: 0,
        status: 'unpaid',
        createdBy: ctx.user.id,
        createdByName: ctx.user.name,
        createdAt: at,
      }
      ctx.db.bills.push(bill)
      // Nothing to collect (free follow-up, fully covered by the panel): settled at once.
      if (bill.patientNetPaise === 0 && bill.discount?.status !== 'pending') markPaid(ctx, bill)
      writeAudit(ctx, {
        action: 'create',
        entity: 'bill',
        entityId: bill.id,
        summary: `Bill ${bill.billNo} for ${v.visitNo}: ₹${(bill.grossPaise / 100).toFixed(2)}${bill.discount ? `, discount ${bill.discount.percent}% (${bill.discount.status === 'pending' ? 'awaiting approval' : override ? `approved by ${override.name} via PIN` : bill.discount.reason})` : ''}`,
      })
      return view(ctx, bill)
    }, 201)
  }),

  http.post(url('/opd/billing/:id/discount'), async ({ request, params }) => {
    const { approve } = (await request.json()) as { approve: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.approve')
      const bill = findInClinic(ctx.db.bills, ctx, params.id as string, 'Bill')
      if (bill.discount?.status !== 'pending') throw new ApiError(409, 'not_pending', 'No discount is waiting for approval on this bill.')
      if (approve && bill.discount.percent > myLimit(ctx)) throw new ApiError(403, 'limit', `Your limit is ${myLimit(ctx)}%. Ask someone with a higher limit.`)
      if (bill.discount.requestedBy === ctx.user.id && approve) throw new ApiError(403, 'self', 'You cannot approve your own discount request.')
      bill.discount = { ...bill.discount, status: approve ? 'approved' : 'rejected', decidedBy: ctx.user.id, decidedByName: ctx.user.name, decidedAt: nowIso() }
      bill.patientNetPaise = bill.patientGrossPaise - (approve ? bill.discount.amountPaise : 0)
      if (bill.patientNetPaise === 0) markPaid(ctx, bill)
      writeAudit(ctx, { action: approve ? 'edit' : 'cancel', entity: 'bill', entityId: bill.id, summary: `${approve ? 'Approved' : 'Rejected'} ${bill.discount.percent}% discount on ${bill.billNo}` })
      return view(ctx, bill)
    })
  }),

  http.post(url('/opd/billing/:id/payment'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.create')
      const data = validate(paymentInputSchema, raw)
      const bill = findInClinic(ctx.db.bills, ctx, params.id as string, 'Bill')
      assertDayOpen(ctx, bill.clinicId)
      if (bill.status !== 'unpaid') throw new ApiError(409, 'state', `Bill ${bill.billNo} is ${bill.status}.`)
      if (bill.discount?.status === 'pending') throw new ApiError(409, 'pending_discount', 'The discount is waiting for approval. Payment can be taken after approval or rejection.')
      const due = bill.patientNetPaise - bill.paidPaise
      const total = data.lines.reduce((s, l) => s + l.amountPaise, 0)
      if (total !== due) throw new ApiError(400, 'amount', `Collect exactly ₹${(due / 100).toFixed(2)} (entered ₹${(total / 100).toFixed(2)}).`)
      for (const l of data.lines) {
        const mode = ctx.db.valueListItems.find((v) => v.clinicId === bill.clinicId && v.type === 'paymentMode' && v.code === l.mode && v.active)
        if (!mode) throw new ApiError(400, 'invalid', `Unknown payment mode ${l.mode}.`)
        if (mode.meta.needsReference && !l.reference) throw new ApiError(400, 'reference', `${mode.label} needs a reference number (UTR / approval code).`, { reference: 'Enter the reference number' })
      }
      const receipt: Receipt = {
        id: crypto.randomUUID(),
        clinicId: bill.clinicId,
        receiptNo: nextReceiptNo(ctx.db, bill.clinicId, todayIST()),
        billId: bill.id,
        lines: data.lines,
        totalPaise: total,
        kind: 'payment',
        receivedBy: ctx.user.id,
        receivedByName: ctx.user.name,
        at: nowIso(),
      }
      ctx.db.receipts.push(receipt)
      bill.paidPaise += total
      markPaid(ctx, bill)
      writeAudit(ctx, { action: 'create', entity: 'receipt', entityId: receipt.id, summary: `Receipt ${receipt.receiptNo}: ₹${(total / 100).toFixed(2)} by ${data.lines.map((l) => l.mode).join(' + ')} for ${bill.billNo}` })
      return receipt
    }, 201)
  }),

  http.post(url('/opd/billing/:id/cancel'), async ({ request, params }) => {
    const { reason } = (await request.json()) as { reason: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.cancel')
      const bill = findInClinic(ctx.db.bills, ctx, params.id as string, 'Bill')
      if (!reason.trim()) throw new ApiError(400, 'invalid', 'Choose a reason.', { reason: 'Choose a reason' })
      if (bill.status === 'cancelled') throw new ApiError(409, 'state', 'Already cancelled.')
      const isAdmin = ctx.db.roles.some((r) => ctx.user.roleIds.includes(r.id) && r.templateKey === 'admin')
      assertCanTouchBillDay(ctx, bill.createdAt)
      if (bill.paidPaise > 0) assertDayOpen(ctx, bill.clinicId)
      const closedDay = !!activeDayClose(ctx.db, bill.clinicId, todayIST(new Date(bill.createdAt)))
      if (settingsOf(ctx.db, bill.clinicId).billCancelSameDayOnly && todayIST(new Date(bill.createdAt)) !== todayIST() && !isAdmin && !closedDay) {
        throw new ApiError(403, 'not_same_day', 'Bills from earlier days can be cancelled only by the Clinic Admin.')
      }
      const at = nowIso()
      if (bill.paidPaise > 0) {
        const refund: Receipt = {
          id: crypto.randomUUID(),
          clinicId: bill.clinicId,
          receiptNo: nextReceiptNo(ctx.db, bill.clinicId, todayIST()),
          billId: bill.id,
          lines: [{ mode: 'cash', amountPaise: -bill.paidPaise, reference: 'Refund' }],
          totalPaise: -bill.paidPaise,
          kind: 'refund',
          receivedBy: ctx.user.id,
          receivedByName: ctx.user.name,
          at,
        }
        ctx.db.receipts.push(refund)
      }
      bill.status = 'cancelled'
      bill.cancelReason = reason.trim()
      bill.cancelledBy = ctx.user.name
      bill.cancelledAt = at
      // Orders become chargeable again; the consultation is unpaid again.
      for (const o of ctx.db.orders.filter((x) => x.billId === bill.id)) {
        o.status = 'ordered'
        delete o.billId
      }
      const v = ctx.db.visits.find((x) => x.id === bill.visitId)!
      if (bill.lines.some((l) => l.serviceId === consultServiceOf(v.clinicId))) {
        v.consultPaid = false
        if (v.status === 'billed') v.status = 'checkedIn'
      }
      v.history.push({ at, by: ctx.user.name, action: `Bill ${bill.billNo} cancelled: ${reason.trim()}` })
      writeAudit(ctx, { action: 'cancel', entity: 'bill', entityId: bill.id, summary: `Cancelled bill ${bill.billNo} (₹${(bill.grossPaise / 100).toFixed(2)}): ${reason.trim()}${bill.paidPaise ? `; refunded ₹${(bill.paidPaise / 100).toFixed(2)}` : ''}` })
      return view(ctx, bill)
    })
  }),

  http.get(url('/opd/billing/by-no'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.view')
      const billNo = new URL(request.url).searchParams.get('billNo') ?? ''
      const b = ctx.db.bills.find((x) => x.clinicId === ctx.clinicId && x.billNo === billNo) ?? notFound('Bill')
      return view(ctx, b)
    }),
  ),

  http.get(url('/opd/billing'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.billing.view')
      const clinicId = requireClinic(ctx)
      const date = new URL(request.url).searchParams.get('date') ?? todayIST()
      const visitsOfDay = new Set(ctx.db.visits.filter((v) => v.clinicId === clinicId && v.date === date).map((v) => v.id))
      const bills = ctx.db.bills.filter((b) => b.clinicId === clinicId && visitsOfDay.has(b.visitId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const collectedByMode: Record<string, number> = {}
      for (const r of ctx.db.receipts.filter((x) => x.clinicId === clinicId && bills.some((b) => b.id === x.billId))) {
        for (const l of r.lines) collectedByMode[l.mode] = (collectedByMode[l.mode] ?? 0) + l.amountPaise
      }
      const rows = bills.map((b) => {
        const v = ctx.db.visits.find((x) => x.id === b.visitId)!
        const p = ctx.db.patients.find((x) => x.id === b.patientId)!
        return {
          id: b.id,
          billNo: b.billNo,
          visitId: b.visitId,
          patientName: p.name,
          uhid: p.uhid,
          doctorName: ctx.db.doctors.find((d) => d.id === v.doctorId)?.name ?? '?',
          grossPaise: b.grossPaise,
          patientNetPaise: b.patientNetPaise,
          panelPaise: b.panelPaise,
          paidPaise: b.paidPaise,
          status: b.status,
          discountPending: b.discount?.status === 'pending',
          discountPercent: b.discount?.percent ?? 0,
          createdAt: b.createdAt,
          createdByName: b.createdByName,
          modes: [...new Set(ctx.db.receipts.filter((r) => r.billId === b.id && r.kind === 'payment').flatMap((r) => r.lines.map((l) => l.mode)))],
        }
      })
      return { rows, collectedByMode, pendingApprovals: rows.filter((r) => r.discountPending && r.status !== 'cancelled').length }
    }),
  ),

  http.get(url('/opd/billing/:id'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.billing.view', 'opd.billing.print'])
      return view(ctx, findInClinic(ctx.db.bills, ctx, params.id as string, 'Bill'))
    }),
  ),
]
