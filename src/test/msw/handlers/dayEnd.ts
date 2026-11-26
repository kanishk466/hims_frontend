/** HTTP-shaped twin of src/api/dayEnd.ts's old mock logic (Stage 6d). */
import { http, type HttpHandler } from 'msw'
import { todayIST } from '@/lib/dates'
import type { CashClosing, DayClose, ModeTotal } from '@/types/dayEnd'
import { DENOMINATIONS, closingInputSchema } from '@/types/dayEnd'
import type { Receipt } from '@/types/opd'
import type { DbShape } from '@/mock/db'
import { ApiError } from '@/api/client'
import { nowIso, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { activeDayClose, label, settingsOf } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

const dateOf = (iso: string) => todayIST(new Date(iso))
const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Receipts already in a closing that is waiting or accepted. */
function coveredIds(db: DbShape, clinicId: string): Set<string> {
  return new Set(db.cashClosings.filter((c) => c.clinicId === clinicId && c.status !== 'rejected').flatMap((c) => c.receiptIds))
}

function totalsByMode(db: DbShape, clinicId: string, receipts: Receipt[]): { byMode: ModeTotal[]; refundsPaise: number } {
  const map = new Map<string, ModeTotal>()
  let refundsPaise = 0
  for (const r of receipts) {
    if (r.kind === 'refund') refundsPaise += -r.totalPaise
    for (const l of r.lines) {
      const m = map.get(l.mode) ?? { mode: l.mode, label: label(db, clinicId, 'paymentMode', l.mode), systemPaise: 0, count: 0 }
      m.systemPaise += l.amountPaise
      m.count += 1
      map.set(l.mode, m)
    }
  }
  // Cash first, then the rest by amount.
  const byMode = [...map.values()].sort((a, b) => (a.mode === 'cash' ? -1 : b.mode === 'cash' ? 1 : b.systemPaise - a.systemPaise))
  return { byMode, refundsPaise }
}

function openReceiptsOf(ctx: RequestContext, userId: string): Receipt[] {
  const clinicId = requireClinic(ctx)
  const covered = coveredIds(ctx.db, clinicId)
  return ctx.db.receipts.filter((r) => r.clinicId === clinicId && r.receivedBy === userId && !covered.has(r.id)).sort((a, b) => a.at.localeCompare(b.at))
}

function buildView(ctx: RequestContext, date: string) {
  const clinicId = requireClinic(ctx)
  const covered = coveredIds(ctx.db, clinicId)
  const dayReceipts = ctx.db.receipts.filter((r) => r.clinicId === clinicId && dateOf(r.at) === date)
  const closings = ctx.db.cashClosings.filter((c) => c.clinicId === clinicId && c.date === date)
  const userIds = [...new Set([...dayReceipts.map((r) => r.receivedBy), ...closings.map((c) => c.cashierId)])]
  const cashiers = userIds.map((userId) => {
    const open = dayReceipts.filter((r) => r.receivedBy === userId && !covered.has(r.id))
    return {
      userId,
      name: ctx.db.users.find((u) => u.id === userId)?.name ?? dayReceipts.find((r) => r.receivedBy === userId)?.receivedByName ?? '?',
      openPaise: open.reduce((s, r) => s + r.totalPaise, 0),
      openCount: open.length,
      closings: closings.filter((c) => c.cashierId === userId).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    }
  })
  const { byMode, refundsPaise } = totalsByMode(ctx.db, clinicId, dayReceipts)
  const bills = ctx.db.bills.filter((b) => b.clinicId === clinicId && dateOf(b.createdAt) === date)
  const cancelled = bills.filter((b) => b.status === 'cancelled')
  const live = bills.filter((b) => b.status !== 'cancelled')
  const openVisits = ctx.db.visits.filter((v) => v.clinicId === clinicId && v.date === date && !v.emergency && !['completed', 'cancelled', 'noShow'].includes(v.status)).length
  const closed = activeDayClose(ctx.db, clinicId, date)
  const blockers: string[] = []
  if (!closed) {
    if (date > todayIST()) blockers.push('This date is in the future.')
    for (const c of cashiers) {
      if (c.openCount) blockers.push(`${c.name} has not handed over ${c.openCount} receipt${c.openCount > 1 ? 's' : ''} (${rupees(c.openPaise)}).`)
      const waiting = c.closings.filter((x) => x.status === 'submitted').length
      if (waiting) blockers.push(`${c.name}'s handover is waiting for acceptance.`)
    }
  }
  return {
    date,
    closed,
    cashiers: cashiers.sort((a, b) => a.name.localeCompare(b.name)),
    byMode,
    refundsPaise,
    bills: {
      count: live.length,
      grossPaise: live.reduce((s, b) => s + b.grossPaise, 0),
      discountPaise: live.reduce((s, b) => s + (b.discount && ['auto', 'approved'].includes(b.discount.status) ? b.discount.amountPaise : 0), 0),
      panelPaise: live.reduce((s, b) => s + b.panelPaise, 0),
      cancelled: cancelled.length,
      cancelledPaise: cancelled.reduce((s, b) => s + b.grossPaise, 0),
    },
    openVisits,
    blockers,
    printedAt: nowIso(),
    clinicName: ctx.db.clinics.find((c) => c.id === clinicId)!.name,
  }
}

export const dayEndHandlers: HttpHandler[] = [
  http.get(url('/opd/day-end/my-counter'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.dayEnd.create')
      const clinicId = requireClinic(ctx)
      const open = openReceiptsOf(ctx, ctx.user.id)
      const { byMode, refundsPaise } = totalsByMode(ctx.db, clinicId, open)
      return {
        receiptsCount: open.length,
        from: open[0]?.at ?? null,
        byMode,
        refundsPaise,
        cashSystemPaise: byMode.find((m) => m.mode === 'cash')?.systemPaise ?? 0,
        tolerancePaise: settingsOf(ctx.db, clinicId).cashVarianceTolerancePaise,
        closings: ctx.db.cashClosings
          .filter((c) => c.clinicId === clinicId && c.cashierId === ctx.user.id)
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
          .slice(0, 10),
        todayClosed: activeDayClose(ctx.db, clinicId, todayIST()),
      }
    }),
  ),

  http.post(url('/opd/day-end/closings'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.dayEnd.create')
      const data = validate(closingInputSchema, raw)
      const clinicId = requireClinic(ctx)
      const open = openReceiptsOf(ctx, ctx.user.id)
      if (!open.length) throw new ApiError(409, 'nothing', 'You have no receipts to hand over.')
      const { byMode, refundsPaise } = totalsByMode(ctx.db, clinicId, open)
      const cashSystemPaise = byMode.find((m) => m.mode === 'cash')?.systemPaise ?? 0
      const notes = Object.fromEntries(DENOMINATIONS.map((d) => [String(d), data.notes[String(d)] ?? 0]))
      const cashCountedPaise = DENOMINATIONS.reduce((s, d) => s + d * 100 * (notes[String(d)] ?? 0), 0) + data.coinsPaise
      const variance = cashCountedPaise - cashSystemPaise
      const nonCash = byMode
        .filter((m) => m.mode !== 'cash')
        .map((m) => ({ mode: m.mode, label: m.label, systemPaise: m.systemPaise, confirmedPaise: data.nonCash.find((x) => x.mode === m.mode)?.confirmedPaise ?? m.systemPaise }))
      const tolerance = settingsOf(ctx.db, clinicId).cashVarianceTolerancePaise
      const nonCashOff = nonCash.filter((n) => n.confirmedPaise !== n.systemPaise)
      if ((Math.abs(variance) > tolerance || nonCashOff.length) && !data.reason) {
        const what = [Math.abs(variance) > tolerance ? `cash is ${variance < 0 ? 'short' : 'over'} by ${rupees(Math.abs(variance))}` : '', ...nonCashOff.map((n) => `${n.label} differs by ${rupees(n.confirmedPaise - n.systemPaise)}`)]
          .filter(Boolean)
          .join('; ')
        throw new ApiError(400, 'reason', `Explain the difference: ${what}.`, { reason: 'Explain the difference' })
      }
      const at = nowIso()
      const c: CashClosing = {
        id: crypto.randomUUID(),
        clinicId,
        date: todayIST(),
        cashierId: ctx.user.id,
        cashierName: ctx.user.name,
        from: open[0]!.at,
        to: at,
        receiptIds: open.map((r) => r.id),
        byMode,
        refundsPaise,
        cashSystemPaise,
        notes,
        coinsPaise: data.coinsPaise,
        cashCountedPaise,
        cashVariancePaise: variance,
        nonCash,
        reason: data.reason || undefined,
        status: 'submitted',
        submittedAt: at,
      }
      ctx.db.cashClosings.push(c)
      writeAudit(ctx, { action: 'create', entity: 'dayEnd', entityId: c.id, summary: `Handed over ${rupees(cashCountedPaise)} cash (${open.length} receipts)${variance ? `, ${variance < 0 ? 'short' : 'over'} ${rupees(Math.abs(variance))}` : ''}` })
      return c
    }, 201)
  }),

  http.post(url('/opd/day-end/closings/:id/decide'), async ({ request, params }) => {
    const raw = (await request.json()) as { accept: boolean; note?: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.dayEnd.approve')
      const { accept, note } = raw
      const c = ctx.db.cashClosings.find((x) => x.id === (params.id as string) && x.clinicId === requireClinic(ctx))
      if (!c) throw new ApiError(404, 'not_found', 'Closing not found.')
      if (c.status !== 'submitted') throw new ApiError(409, 'state', `This closing is already ${c.status}.`)
      if (c.cashierId === ctx.user.id) throw new ApiError(403, 'own', 'You cannot accept your own cash handover. Ask another approver.')
      if (!accept && !note?.trim()) throw new ApiError(400, 'invalid', 'Say why it is sent back.', { note: 'Enter a note' })
      c.status = accept ? 'accepted' : 'rejected'
      c.decidedBy = ctx.user.id
      c.decidedByName = ctx.user.name
      c.decidedAt = nowIso()
      if (!accept) c.rejectNote = note!.trim()
      writeAudit(ctx, { action: accept ? 'approve' : 'reject', entity: 'dayEnd', entityId: c.id, summary: `${accept ? 'Accepted' : 'Sent back'} ${c.cashierName}'s handover of ${rupees(c.cashCountedPaise)}${accept ? '' : `: ${note!.trim()}`}` })
      return c
    })
  }),

  http.get(url('/opd/day-end/closings/:id'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.dayEnd.create', 'opd.dayEnd.approve', 'opd.dayEnd.print'])
      const c = ctx.db.cashClosings.find((x) => x.id === (params.id as string) && x.clinicId === requireClinic(ctx))
      if (!c) throw new ApiError(404, 'not_found', 'Closing not found.')
      if (c.cashierId !== ctx.user.id && !ctx.permissions.has('opd.dayEnd.approve') && !ctx.permissions.has('opd.dayEnd.print')) throw new ApiError(403, 'forbidden', 'You can print only your own handover.')
      return { ...c, clinicName: ctx.db.clinics.find((x) => x.id === c.clinicId)!.name }
    }),
  ),

  http.get(url('/opd/day-end/:date'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['opd.dayEnd.approve', 'opd.dayEnd.print'])
      return buildView(ctx, params.date as string)
    }),
  ),

  http.post(url('/opd/day-end/:date/close'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.dayEnd.approve')
      const clinicId = requireClinic(ctx)
      const date = params.date as string
      const view = buildView(ctx, date)
      if (view.closed) throw new ApiError(409, 'state', `${date} is already closed.`)
      if (view.blockers.length) throw new ApiError(409, 'blocked', view.blockers.join(' '))
      const at = nowIso()
      let visitsClosed = 0
      for (const v of ctx.db.visits) {
        if (v.clinicId !== clinicId || v.date !== date || v.emergency || ['completed', 'cancelled', 'noShow'].includes(v.status)) continue
        const next = v.status === 'inConsultation' ? 'completed' : 'noShow'
        v.status = next
        v.history.push({ at, by: ctx.user.name, action: `Closed at day end as ${next === 'completed' ? 'completed' : 'no-show'}` })
        visitsClosed++
      }
      const accepted = ctx.db.cashClosings.filter((c) => c.clinicId === clinicId && c.date === date && c.status === 'accepted')
      const existing = ctx.db.dayCloses.find((d) => d.clinicId === clinicId && d.date === date)
      const record: DayClose = {
        id: existing?.id ?? crypto.randomUUID(),
        clinicId,
        date,
        closedBy: ctx.user.id,
        closedByName: ctx.user.name,
        closedAt: at,
        byMode: view.byMode,
        cashHandedOverPaise: accepted.reduce((s, c) => s + c.cashCountedPaise, 0),
        visitsClosed,
        reopened: existing?.reopened,
        active: true,
      }
      if (existing) Object.assign(existing, record)
      else ctx.db.dayCloses.push(record)
      writeAudit(ctx, { action: 'approve', entity: 'dayEnd', entityId: record.id, summary: `Closed the day ${date}: ${rupees(view.byMode.reduce((s, m) => s + m.systemPaise, 0))} collected, ${visitsClosed} open visits closed` })
      return buildView(ctx, date)
    }, 201),
  ),

  http.post(url('/opd/day-end/:date/reopen'), async ({ request, params }) => {
    const { reason } = (await request.json()) as { reason: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'opd.dayEnd.approve')
      if (!reason.trim()) throw new ApiError(400, 'invalid', 'Enter a reason.', { reason: 'Enter a reason' })
      const date = params.date as string
      const d = activeDayClose(ctx.db, requireClinic(ctx), date)
      if (!d) throw new ApiError(409, 'state', `${date} is not closed.`)
      d.active = false
      d.reopened = [...(d.reopened ?? []), { by: ctx.user.name, at: nowIso(), reason: reason.trim() }]
      writeAudit(ctx, { action: 'edit', entity: 'dayEnd', entityId: d.id, summary: `Reopened the day ${date}: ${reason.trim()}` })
      return buildView(ctx, date)
    }, 201)
  }),
]
