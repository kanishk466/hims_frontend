/** HTTP-shaped twin of src/api/reports.ts's old mock logic (Stage 6e). */
import { http, type HttpHandler } from 'msw'
import dayjs from 'dayjs'
import { addDays, todayIST } from '@/lib/dates'
import type { Permission } from '@/auth/permissions'
import type { Bill, Visit } from '@/types/opd'
import { REPORTS, type MdDashboard, type ReportKey, type ReportQuery, type ReportResult, type ReportRow } from '@/types/reports'
import { ApiError } from '@/api/client'
import { requireClinic, requirePermission, type RequestContext } from '@/api/_server'
import { consultServiceOf, label, payerName } from './opdCommon.js'
import { authenticateFromRequest, respond, url } from './common.js'

const dateOf = (iso: string) => todayIST(new Date(iso))
const inRange = (d: string, q: ReportQuery) => d >= q.from && d <= q.to
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const mins = (a: string, b: string) => Math.max(0, dayjs(b).diff(dayjs(a), 'minute'))
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2)
}
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!
}
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
const days = (q: ReportQuery) => {
  const out: string[] = []
  for (let d = q.from; d <= q.to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}
const short = (d: string) => dayjs(d).format('DD MMM')
const CLOSED = ['cancelled', 'noShow']
// Fixed categorical order (validated: CVD-safe adjacent pairs); a fifth mode folds into the table.
const COLORS = ['teal.6', 'blue.6', 'orange.6', 'grape.6']

function validateQuery(q: ReportQuery) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from) || !/^\d{4}-\d{2}-\d{2}$/.test(q.to) || q.from > q.to) throw new ApiError(400, 'invalid', 'Choose a valid date range.')
  if (dayjs(q.to).diff(dayjs(q.from), 'day') > 366) throw new ApiError(400, 'invalid', 'Choose a range of one year or less.')
}

function scope(ctx: RequestContext, q: ReportQuery) {
  const clinicId = requireClinic(ctx)
  const doctors = ctx.db.doctors.filter((d) => d.clinicId === clinicId)
  const depts = ctx.db.departments.filter((d) => d.clinicId === clinicId)
  const visitOk = (v: Visit) => v.clinicId === clinicId && (!q.doctorId || v.doctorId === q.doctorId) && (!q.departmentId || v.departmentId === q.departmentId)
  const visits = ctx.db.visits.filter((v) => visitOk(v) && inRange(v.date, q))
  const visitById = new Map(ctx.db.visits.filter((v) => v.clinicId === clinicId).map((v) => [v.id, v]))
  const billOk = (b: Bill) => {
    const v = visitById.get(b.visitId)
    return !!v && visitOk(v)
  }
  const doctorName = (id: string) => doctors.find((d) => d.id === id)?.name ?? '?'
  const deptName = (id: string) => depts.find((d) => d.id === id)?.name ?? '?'
  return { clinicId, doctors, depts, visits, visitById, billOk, doctorName, deptName }
}

function result(ctx: RequestContext, key: ReportKey, q: ReportQuery, r: Omit<ReportResult, 'key' | 'title' | 'query' | 'generatedAt' | 'clinicName'>): ReportResult {
  return { key, title: REPORTS.find((x) => x.key === key)!.title, query: q, generatedAt: new Date().toISOString(), clinicName: ctx.db.clinics.find((c) => c.id === requireClinic(ctx))!.name, ...r }
}

/* ---------- 1. Footfall ---------- */
function footfall(ctx: RequestContext, q: ReportQuery): ReportResult {
  const s = scope(ctx, q)
  const seen = s.visits.filter((v) => !CLOSED.includes(v.status))
  const kind = (v: Visit) => (v.emergency ? 'emergency' : v.visitType === 'new' ? 'new' : v.visitType === 'freeFollowUp' ? 'freeFollowUp' : 'followUp')
  const byDoc = new Map<string, ReportRow>()
  for (const v of seen) {
    const row = byDoc.get(v.doctorId) ?? { doctor: s.doctorName(v.doctorId), department: s.deptName(v.departmentId), new: 0, followUp: 0, freeFollowUp: 0, emergency: 0, total: 0, share: 0 }
    row[kind(v)] = (row[kind(v)] as number) + 1
    row.total = (row.total as number) + 1
    byDoc.set(v.doctorId, row)
  }
  const rows = [...byDoc.values()].sort((a, b) => (b.total as number) - (a.total as number))
  for (const r of rows) r.share = pct(r.total as number, seen.length)
  const sum = (k: string) => rows.reduce((t, r) => t + (r[k] as number), 0)
  const dayList = days(q)
  return result(ctx, 'footfall', q, {
    tiles: [
      { label: 'Patients', value: seen.length, format: 'int' },
      { label: 'New', value: sum('new'), format: 'int', hint: `${pct(sum('new'), seen.length)}%` },
      { label: 'Follow-up (paid + free)', value: sum('followUp') + sum('freeFollowUp'), format: 'int' },
      { label: 'Average per day', value: Math.round(seen.length / Math.max(1, dayList.length)), format: 'int' },
    ],
    chartTitle: 'Patients per day',
    chart: {
      kind: 'stacked',
      dataKey: 'day',
      format: 'int',
      series: [
        { name: 'new', label: 'New', color: 'teal.6' },
        { name: 'followUp', label: 'Follow-up', color: 'blue.6' },
        { name: 'emergency', label: 'Emergency', color: 'orange.6' },
      ],
      data: dayList.map((d) => {
        const vs = seen.filter((v) => v.date === d)
        return { day: short(d), new: vs.filter((v) => kind(v) === 'new').length, followUp: vs.filter((v) => kind(v).startsWith('f')).length, emergency: vs.filter((v) => v.emergency).length }
      }),
    },
    columns: [
      { key: 'doctor', label: 'Doctor', format: 'text' },
      { key: 'department', label: 'Department', format: 'text' },
      { key: 'new', label: 'New', format: 'int' },
      { key: 'followUp', label: 'Follow-up', format: 'int' },
      { key: 'freeFollowUp', label: 'Free follow-up', format: 'int' },
      { key: 'emergency', label: 'Emergency', format: 'int' },
      { key: 'total', label: 'Total', format: 'int' },
      { key: 'share', label: 'Share', format: 'pct' },
    ],
    rows,
    totals: { doctor: 'Total', department: '', new: sum('new'), followUp: sum('followUp'), freeFollowUp: sum('freeFollowUp'), emergency: sum('emergency'), total: seen.length, share: seen.length ? 100 : 0 },
    note: 'Cancelled visits and no-shows are not counted.',
  })
}

/* ---------- 2. Collection ---------- */
function collection(ctx: RequestContext, q: ReportQuery): ReportResult {
  const s = scope(ctx, q)
  const bills = new Map(ctx.db.bills.filter((b) => b.clinicId === s.clinicId).map((b) => [b.id, b]))
  const receipts = ctx.db.receipts.filter((r) => r.clinicId === s.clinicId && inRange(dateOf(r.at), q) && s.billOk(bills.get(r.billId)!))
  const modes = [...new Set(receipts.flatMap((r) => r.lines.map((l) => l.mode)))].sort((a, b) => (a === 'cash' ? -1 : b === 'cash' ? 1 : a.localeCompare(b)))
  const modeLabel = (m: string) => label(ctx.db, s.clinicId, 'paymentMode', m)
  const byCashier = new Map<string, ReportRow>()
  for (const r of receipts) {
    const row = byCashier.get(r.receivedBy) ?? { cashier: r.receivedByName, receipts: 0, ...Object.fromEntries(modes.map((m) => [m, 0])), refunds: 0, net: 0 }
    if (r.kind === 'refund') row.refunds = (row.refunds as number) + -r.totalPaise
    else row.receipts = (row.receipts as number) + 1
    for (const l of r.lines) if (l.amountPaise > 0) row[l.mode] = (row[l.mode] as number) + l.amountPaise
    row.net = (row.net as number) + r.totalPaise
    byCashier.set(r.receivedBy, row)
  }
  const rows = [...byCashier.values()].sort((a, b) => (b.net as number) - (a.net as number))
  const sum = (k: string) => rows.reduce((t, r) => t + (r[k] as number), 0)
  const dayList = days(q)
  return result(ctx, 'collection', q, {
    tiles: [
      { label: 'Net collected', value: sum('net'), format: 'inr' },
      ...modes.slice(0, 3).map((m) => ({ label: modeLabel(m), value: sum(m), format: 'inr' as const, hint: `${pct(sum(m), sum('net') + sum('refunds'))}%` })),
      { label: 'Refunds', value: sum('refunds'), format: 'inr' },
    ],
    chartTitle: 'Collection per day',
    chart: {
      kind: 'stacked',
      dataKey: 'day',
      format: 'inr',
      series: modes.slice(0, COLORS.length).map((m, i) => ({ name: m, label: modeLabel(m), color: COLORS[i]! })),
      data: dayList.map((d) => {
        const rs = receipts.filter((r) => dateOf(r.at) === d && r.kind === 'payment')
        return { day: short(d), ...Object.fromEntries(modes.map((m) => [m, rs.flatMap((r) => r.lines).filter((l) => l.mode === m).reduce((t, l) => t + l.amountPaise, 0)])) }
      }),
    },
    columns: [
      { key: 'cashier', label: 'Cashier', format: 'text' },
      { key: 'receipts', label: 'Receipts', format: 'int' },
      ...modes.map((m) => ({ key: m, label: modeLabel(m), format: 'inr' as const })),
      { key: 'refunds', label: 'Refunds', format: 'inr' },
      { key: 'net', label: 'Net', format: 'inr' },
    ],
    rows,
    totals: { cashier: 'Total', receipts: sum('receipts'), ...Object.fromEntries(modes.map((m) => [m, sum(m)])), refunds: sum('refunds'), net: sum('net') },
    note: 'By the date the money was received. Panel amounts are billed to the panel and are not in this report.',
  })
}

/* ---------- 3. Doctor revenue ---------- */
function doctorRevenue(ctx: RequestContext, q: ReportQuery): ReportResult {
  const s = scope(ctx, q)
  const cons = consultServiceOf(s.clinicId)
  const bills = ctx.db.bills.filter((b) => b.clinicId === s.clinicId && b.status !== 'cancelled' && inRange(dateOf(b.createdAt), q) && s.billOk(b))
  type Acc = { doctor: string; department: string; consultation: number; tests: number; discount: number; gross: number; net: number; visits: Set<string> }
  const byDoc = new Map<string, Acc>()
  for (const b of bills) {
    const v = s.visitById.get(b.visitId)!
    const row = byDoc.get(v.doctorId) ?? { doctor: s.doctorName(v.doctorId), department: s.deptName(v.departmentId), consultation: 0, tests: 0, discount: 0, gross: 0, net: 0, visits: new Set<string>() }
    row.visits.add(v.id)
    for (const l of b.lines) {
      if (l.serviceId === cons) row.consultation += l.amountPaise
      else row.tests += l.amountPaise
    }
    const disc = b.discount && ['auto', 'approved'].includes(b.discount.status) ? b.discount.amountPaise : 0
    row.discount += disc
    row.gross += b.grossPaise
    row.net += b.grossPaise - disc
    byDoc.set(v.doctorId, row)
  }
  const rows: ReportRow[] = [...byDoc.values()]
    .map(({ visits, ...r }) => ({ ...r, patients: visits.size, perPatient: visits.size ? Math.round(r.net / visits.size) : 0 }))
    .sort((a, b) => (b.net as number) - (a.net as number))
  const sum = (k: string) => rows.reduce((t, r) => t + (r[k] as number), 0)
  return result(ctx, 'doctorRevenue', q, {
    tiles: [
      { label: 'Net revenue', value: sum('net'), format: 'inr' },
      { label: 'Consultations', value: sum('consultation'), format: 'inr' },
      { label: 'Tests and procedures', value: sum('tests'), format: 'inr' },
      { label: 'Per patient', value: sum('patients') ? Math.round(sum('net') / sum('patients')) : 0, format: 'inr' },
    ],
    chartTitle: 'Net revenue by doctor',
    chart: { kind: 'bar', dataKey: 'doctor', format: 'inr', series: [{ name: 'net', label: 'Net revenue', color: 'teal.6' }], data: rows.map((r) => ({ doctor: String(r.doctor).replace('Dr. ', ''), net: r.net as number })) },
    columns: [
      { key: 'doctor', label: 'Doctor', format: 'text' },
      { key: 'department', label: 'Department', format: 'text' },
      { key: 'patients', label: 'Patients billed', format: 'int' },
      { key: 'consultation', label: 'Consultation', format: 'inr' },
      { key: 'tests', label: 'Tests & procedures', format: 'inr' },
      { key: 'discount', label: 'Discounts', format: 'inr' },
      { key: 'net', label: 'Net', format: 'inr' },
      { key: 'perPatient', label: 'Per patient', format: 'inr' },
    ],
    rows,
    totals: { doctor: 'Total', department: '', patients: sum('patients'), consultation: sum('consultation'), tests: sum('tests'), discount: sum('discount'), net: sum('net'), perPatient: sum('patients') ? Math.round(sum('net') / sum('patients')) : 0 },
    note: 'Billed amounts (including the panel’s share), by bill date. Cancelled bills are left out.',
  })
}

/* ---------- 4. Appointments ---------- */
function appointments_(ctx: RequestContext, q: ReportQuery): ReportResult {
  const s = scope(ctx, q)
  const today = todayIST()
  const list = ctx.db.appointments.filter((a) => {
    if (a.clinicId !== s.clinicId || !inRange(a.date, q) || a.date > today) return false
    if (q.doctorId && a.doctorId !== q.doctorId) return false
    if (q.departmentId && ctx.db.doctors.find((d) => d.id === a.doctorId)?.departmentId !== q.departmentId) return false
    return true
  })
  const byDoc = new Map<string, ReportRow>()
  for (const a of list) {
    const doc = ctx.db.doctors.find((d) => d.id === a.doctorId)
    const row = byDoc.get(a.doctorId) ?? { doctor: doc?.name ?? '?', booked: 0, arrived: 0, noShow: 0, cancelled: 0, upcoming: 0, noShowRate: 0, cancelRate: 0 }
    row.booked = (row.booked as number) + 1
    const k = a.status === 'booked' ? 'upcoming' : a.status
    row[k] = (row[k] as number) + 1
    byDoc.set(a.doctorId, row)
  }
  const rows = [...byDoc.values()].sort((a, b) => (b.booked as number) - (a.booked as number))
  for (const r of rows) {
    r.noShowRate = pct(r.noShow as number, (r.arrived as number) + (r.noShow as number))
    r.cancelRate = pct(r.cancelled as number, r.booked as number)
  }
  const sum = (k: string) => rows.reduce((t, r) => t + (r[k] as number), 0)
  const weeks = new Map<string, { arrived: number; noShow: number; cancelled: number; booked: number }>()
  for (const a of list) {
    const w = dayjs(a.date).startOf('week').add(1, 'day').format('YYYY-MM-DD')
    const x = weeks.get(w) ?? { arrived: 0, noShow: 0, cancelled: 0, booked: 0 }
    x.booked++
    if (a.status === 'arrived') x.arrived++
    if (a.status === 'noShow') x.noShow++
    if (a.status === 'cancelled') x.cancelled++
    weeks.set(w, x)
  }
  return result(ctx, 'appointments', q, {
    tiles: [
      { label: 'Appointments', value: sum('booked'), format: 'int' },
      { label: 'Arrived', value: sum('arrived'), format: 'int' },
      { label: 'No-show rate', value: pct(sum('noShow'), sum('arrived') + sum('noShow')), format: 'pct' },
      { label: 'Cancellation rate', value: pct(sum('cancelled'), sum('booked')), format: 'pct' },
    ],
    chartTitle: 'No-show and cancellation rate by week',
    chart: {
      kind: 'line',
      dataKey: 'week',
      format: 'pct',
      series: [
        { name: 'noShow', label: 'No-show %', color: 'blue.6' },
        { name: 'cancelled', label: 'Cancelled %', color: 'orange.6' },
      ],
      data: [...weeks.entries()].sort().map(([w, x]) => ({ week: `w/c ${short(w)}`, noShow: pct(x.noShow, x.arrived + x.noShow), cancelled: pct(x.cancelled, x.booked) })),
    },
    columns: [
      { key: 'doctor', label: 'Doctor', format: 'text' },
      { key: 'booked', label: 'Booked', format: 'int' },
      { key: 'arrived', label: 'Arrived', format: 'int' },
      { key: 'noShow', label: 'No-show', format: 'int' },
      { key: 'cancelled', label: 'Cancelled', format: 'int' },
      { key: 'upcoming', label: 'Still booked', format: 'int' },
      { key: 'noShowRate', label: 'No-show rate', format: 'pct' },
      { key: 'cancelRate', label: 'Cancel rate', format: 'pct' },
    ],
    rows,
    totals: { doctor: 'Total', booked: sum('booked'), arrived: sum('arrived'), noShow: sum('noShow'), cancelled: sum('cancelled'), upcoming: sum('upcoming'), noShowRate: pct(sum('noShow'), sum('arrived') + sum('noShow')), cancelRate: pct(sum('cancelled'), sum('booked')) },
    note: 'No-show rate = no-shows ÷ (arrived + no-shows). Future appointments are left out.',
  })
}

/* ---------- 5. Waiting time ---------- */
function waitingTime(ctx: RequestContext, q: ReportQuery): ReportResult {
  const s = scope(ctx, q)
  const seen = s.visits.filter((v) => v.calledAt && !v.emergency)
  const waitOf = (v: Visit) => mins(v.checkedInAt, v.calledAt!)
  const all = seen.map(waitOf)
  const byDoc = new Map<string, number[]>()
  for (const v of seen) byDoc.set(v.doctorId, [...(byDoc.get(v.doctorId) ?? []), waitOf(v)])
  const rows: ReportRow[] = [...byDoc.entries()]
    .map(([id, xs]) => ({ doctor: s.doctorName(id), patients: xs.length, avg: avg(xs), median: median(xs), p90: percentile(xs, 90), over30: xs.filter((x) => x > 30).length, over30Pct: pct(xs.filter((x) => x > 30).length, xs.length) }))
    .sort((a, b) => b.avg - a.avg)
  const hours = Array.from({ length: 14 }, (_, i) => i + 8)
  const hourOf = (iso: string) => Number(dayjs(iso).tz('Asia/Kolkata').format('H'))
  return result(ctx, 'waitingTime', q, {
    tiles: [
      { label: 'Average wait', value: avg(all), format: 'min' },
      { label: 'Median', value: median(all), format: 'min' },
      { label: '90% seen within', value: percentile(all, 90), format: 'min' },
      { label: 'Waited over 30 min', value: pct(all.filter((x) => x > 30).length, all.length), format: 'pct' },
    ],
    chartTitle: 'Average wait by hour of check-in',
    chart: {
      kind: 'bar',
      dataKey: 'hour',
      format: 'min',
      series: [{ name: 'avg', label: 'Average wait (min)', color: 'teal.6' }],
      data: hours.map((h) => ({ hour: `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`, avg: avg(seen.filter((v) => hourOf(v.checkedInAt) === h).map(waitOf)) })),
    },
    columns: [
      { key: 'doctor', label: 'Doctor', format: 'text' },
      { key: 'patients', label: 'Patients', format: 'int' },
      { key: 'avg', label: 'Average', format: 'min' },
      { key: 'median', label: 'Median', format: 'min' },
      { key: 'p90', label: '90th percentile', format: 'min' },
      { key: 'over30', label: 'Over 30 min', format: 'int' },
      { key: 'over30Pct', label: 'Over 30 min %', format: 'pct' },
    ],
    rows,
    totals: { doctor: 'All doctors', patients: all.length, avg: avg(all), median: median(all), p90: percentile(all, 90), over30: all.filter((x) => x > 30).length, over30Pct: pct(all.filter((x) => x > 30).length, all.length) },
    note: 'From check-in to being called into the room. Casualty visits are left out.',
  })
}

/* ---------- 6. Discounts and cancelled bills ---------- */
function discounts(ctx: RequestContext, q: ReportQuery): ReportResult {
  const s = scope(ctx, q)
  const reasonLabel = (type: string, code?: string) => (code ? label(ctx.db, s.clinicId, type, code) : '')
  const bills = ctx.db.bills.filter((b) => b.clinicId === s.clinicId && inRange(dateOf(b.createdAt), q) && s.billOk(b))
  const patient = (id: string) => ctx.db.patients.find((p) => p.id === id)
  const rows: ReportRow[] = []
  for (const b of bills) {
    const v = s.visitById.get(b.visitId)!
    const base = { date: dateOf(b.createdAt), billNo: b.billNo, uhid: patient(b.patientId)?.uhid ?? '', patient: patient(b.patientId)?.name ?? '', doctor: s.doctorName(v.doctorId) }
    if (b.discount && ['auto', 'approved', 'pending'].includes(b.discount.status)) {
      rows.push({ ...base, type: b.discount.status === 'pending' ? 'Discount (waiting)' : 'Discount', reason: reasonLabel('discountReason', b.discount.reason), percent: b.discount.percent, amount: b.discount.amountPaise, by: b.discount.requestedByName, approvedBy: b.discount.decidedByName ?? (b.discount.status === 'auto' ? 'Within limit' : '') })
    }
    if (b.status === 'cancelled') rows.push({ ...base, type: 'Cancelled bill', reason: reasonLabel('cancelReason', b.cancelReason), percent: null, amount: b.grossPaise, by: b.cancelledBy ?? '', approvedBy: '' })
  }
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.billNo).localeCompare(String(a.billNo)))
  const disc = rows.filter((r) => r.type === 'Discount')
  const canc = rows.filter((r) => r.type === 'Cancelled bill')
  const byReason = new Map<string, number>()
  for (const r of disc) byReason.set(String(r.reason), (byReason.get(String(r.reason)) ?? 0) + (r.amount as number))
  return result(ctx, 'discounts', q, {
    tiles: [
      { label: 'Discounts given', value: disc.reduce((t, r) => t + (r.amount as number), 0), format: 'inr', hint: `${disc.length} bills` },
      { label: 'Approved above the limit', value: disc.filter((r) => r.approvedBy && r.approvedBy !== 'Within limit').length, format: 'int' },
      { label: 'Cancelled bills', value: canc.length, format: 'int' },
      { label: 'Cancelled amount', value: canc.reduce((t, r) => t + (r.amount as number), 0), format: 'inr' },
    ],
    chartTitle: 'Discount by reason',
    chart: { kind: 'bar', dataKey: 'reason', format: 'inr', series: [{ name: 'amount', label: 'Discount', color: 'teal.6' }], data: [...byReason.entries()].map(([reason, amount]) => ({ reason, amount })).sort((a, b) => b.amount - a.amount) },
    columns: [
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'billNo', label: 'Bill', format: 'text' },
      { key: 'uhid', label: 'UHID', format: 'text' },
      { key: 'patient', label: 'Patient', format: 'text' },
      { key: 'doctor', label: 'Doctor', format: 'text' },
      { key: 'type', label: 'Type', format: 'text' },
      { key: 'reason', label: 'Reason', format: 'text' },
      { key: 'percent', label: '%', format: 'pct' },
      { key: 'amount', label: 'Amount', format: 'inr' },
      { key: 'by', label: 'Asked / cancelled by', format: 'text' },
      { key: 'approvedBy', label: 'Approved by', format: 'text' },
    ],
    rows,
    note: '“Within limit” = inside the cashier’s role discount limit, so no approval was needed.',
  })
}

/* ---------- 7. Top diagnoses ---------- */
function diagnoses(ctx: RequestContext, q: ReportQuery): ReportResult {
  const s = scope(ctx, q)
  const ids = new Set(s.visits.filter((v) => !CLOSED.includes(v.status)).map((v) => v.id))
  const notes = ctx.db.notes.filter((n) => ids.has(n.visitId) && n.diagnoses.length)
  const counts = new Map<string, { code: string; name: string; count: number; depts: Map<string, number> }>()
  for (const n of notes) {
    const v = s.visitById.get(n.visitId)!
    for (const d of n.diagnoses) {
      const c = counts.get(d.code) ?? { code: d.code, name: d.name, count: 0, depts: new Map() }
      c.count++
      c.depts.set(v.departmentId, (c.depts.get(v.departmentId) ?? 0) + 1)
      counts.set(d.code, c)
    }
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count)
  const rows: ReportRow[] = top.slice(0, 30).map((c, i) => ({
    rank: i + 1,
    code: c.code,
    name: c.name,
    count: c.count,
    share: pct(c.count, notes.length),
    department: s.deptName([...c.depts.entries()].sort((a, b) => b[1] - a[1])[0]![0]),
  }))
  return result(ctx, 'diagnoses', q, {
    tiles: [
      { label: 'Visits with a diagnosis', value: notes.length, format: 'int' },
      { label: 'Different diagnoses', value: counts.size, format: 'int' },
      { label: `Most common: ${top[0]?.code ?? '—'}`, value: top[0]?.count ?? 0, format: 'int', hint: top[0]?.name },
      { label: 'Top 10 share', value: pct(top.slice(0, 10).reduce((t, c) => t + c.count, 0), notes.length), format: 'pct' },
    ],
    chartTitle: 'Top 10 diagnoses',
    chart: { kind: 'bar', dataKey: 'code', format: 'int', series: [{ name: 'count', label: 'Visits', color: 'teal.6' }], data: top.slice(0, 10).map((c) => ({ code: c.code, count: c.count })) },
    columns: [
      { key: 'rank', label: '#', format: 'int' },
      { key: 'code', label: 'ICD-10', format: 'text' },
      { key: 'name', label: 'Diagnosis', format: 'text' },
      { key: 'count', label: 'Visits', format: 'int' },
      { key: 'share', label: 'Share', format: 'pct' },
      { key: 'department', label: 'Mostly in', format: 'text' },
    ],
    rows,
    note: 'Share = visits with this diagnosis ÷ visits with any diagnosis. A visit can have more than one diagnosis.',
  })
}

const BUILDERS: Record<ReportKey, (ctx: RequestContext, q: ReportQuery) => ReportResult> = { footfall, collection, doctorRevenue, appointments: appointments_, waitingTime, discounts, diagnoses }

const REPORT_VIEW_PERMS = REPORTS.map((r) => `reports.${r.key}.view` as Permission)

function mdDashboard(ctx: RequestContext): MdDashboard {
  const clinicId = requireClinic(ctx)
  const today = todayIST()
  const visits = ctx.db.visits.filter((v) => v.clinicId === clinicId)
  const todays = visits.filter((v) => v.date === today)
  const seenToday = todays.filter((v) => !CLOSED.includes(v.status))
  const receiptsByDay = new Map<string, number>()
  for (const r of ctx.db.receipts) if (r.clinicId === clinicId) receiptsByDay.set(dateOf(r.at), (receiptsByDay.get(dateOf(r.at)) ?? 0) + r.totalPaise)
  const billsToday = ctx.db.bills.filter((b) => b.clinicId === clinicId && b.status !== 'cancelled' && dateOf(b.createdAt) === today)
  const waits = todays.filter((v) => v.calledAt && !v.emergency).map((v) => mins(v.checkedInAt, v.calledAt!))
  const doctorIds = [...new Set(todays.map((v) => v.doctorId))]
  const trendDays = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  const visitsOn = (d: string) => visits.filter((v) => v.date === d && !CLOSED.includes(v.status)).length
  const sumRange = (from: number, to: number) => {
    let p = 0
    let rev = 0
    for (let i = from; i <= to; i++) {
      const d = addDays(today, -i)
      p += visitsOn(d)
      rev += receiptsByDay.get(d) ?? 0
    }
    return { p, rev }
  }
  const last = sumRange(0, 29)
  const prev = sumRange(30, 59)
  const change = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null)
  const since = addDays(today, -29)
  const recent = visits.filter((v) => v.date >= since && !CLOSED.includes(v.status))
  const payer = new Map<string, { payer: string; visits: number; grossPaise: number }>()
  for (const v of recent) {
    const key = v.payerId
    const x = payer.get(key) ?? { payer: payerName(ctx.db, key), visits: 0, grossPaise: 0 }
    x.visits++
    payer.set(key, x)
  }
  for (const b of ctx.db.bills) {
    const x = payer.get(b.payerId)
    if (x && b.clinicId === clinicId && b.status !== 'cancelled' && dateOf(b.createdAt) >= since) x.grossPaise += b.grossPaise
  }
  const recentIds = new Set(recent.map((v) => v.id))
  const dx = new Map<string, { code: string; name: string; count: number }>()
  for (const n of ctx.db.notes) if (recentIds.has(n.visitId)) for (const d of n.diagnoses) dx.set(d.code, { code: d.code, name: d.name, count: (dx.get(d.code)?.count ?? 0) + 1 })
  return {
    today: {
      patients: seenToday.length,
      newPatients: seenToday.filter((v) => v.visitType === 'new' && !v.emergency).length,
      followUps: seenToday.filter((v) => v.visitType !== 'new' && !v.emergency).length,
      emergencies: seenToday.filter((v) => v.emergency).length,
      waitingNow: todays.filter((v) => ['checkedIn', 'billed', 'vitalsDone'].includes(v.status)).length,
      inConsultationNow: todays.filter((v) => v.status === 'inConsultation').length,
      collectedPaise: receiptsByDay.get(today) ?? 0,
      panelDuesPaise: billsToday.reduce((t, b) => t + b.panelPaise, 0),
      discountsPaise: billsToday.reduce((t, b) => t + (b.discount && ['auto', 'approved'].includes(b.discount.status) ? b.discount.amountPaise : 0), 0),
      avgWaitMinutes: waits.length ? avg(waits) : null,
      noShows: todays.filter((v) => v.status === 'noShow').length + ctx.db.appointments.filter((a) => a.clinicId === clinicId && a.date === today && a.status === 'noShow').length,
    },
    doctors: doctorIds
      .map((id) => {
        const mine = todays.filter((v) => v.doctorId === id)
        const d = ctx.db.doctors.find((x) => x.id === id)!
        const w = mine.filter((v) => v.calledAt && !v.emergency).map((v) => mins(v.checkedInAt, v.calledAt!))
        return {
          doctorId: id,
          name: d.name,
          department: ctx.db.departments.find((x) => x.id === d.departmentId)?.name ?? '',
          waiting: mine.filter((v) => ['checkedIn', 'billed', 'vitalsDone'].includes(v.status)).length,
          inRoom: mine.filter((v) => v.status === 'inConsultation').length,
          done: mine.filter((v) => v.status === 'completed').length,
          avgWait: w.length ? avg(w) : null,
        }
      })
      .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name)),
    trend: trendDays.map((d) => ({ date: d, patients: visitsOn(d), revenue: receiptsByDay.get(d) ?? 0 })),
    change: { patientsPct: change(last.p, prev.p), revenuePct: change(last.rev, prev.rev), patients30: last.p, revenue30Paise: last.rev },
    payerMix: [...payer.values()].sort((a, b) => b.visits - a.visits),
    topDiagnoses: [...dx.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  }
}

export const reportsHandlers: HttpHandler[] = [
  http.get(url('/reports/filters'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, [...REPORT_VIEW_PERMS, 'reports.mdDashboard.view'])
      const clinicId = requireClinic(ctx)
      return {
        doctors: ctx.db.doctors.filter((d) => d.clinicId === clinicId).map((d) => ({ id: d.id, name: d.name, departmentId: d.departmentId })),
        departments: ctx.db.departments.filter((d) => d.clinicId === clinicId && d.type === 'clinical').map((d) => ({ id: d.id, name: d.name })),
      }
    }),
  ),

  http.get(url('/reports/md-dashboard'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'reports.mdDashboard.view')
      return mdDashboard(ctx)
    }),
  ),

  http.get(url('/reports/:key'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      const key = params.key as string
      const builder = (BUILDERS as Record<string, (ctx: RequestContext, q: ReportQuery) => ReportResult>)[key]
      if (!builder) throw new ApiError(404, 'not_found', 'Unknown report.')
      requirePermission(ctx, `reports.${key}.view` as Permission)
      const search = new URL(request.url).searchParams
      const q: ReportQuery = { from: search.get('from') ?? '', to: search.get('to') ?? '', doctorId: search.get('doctorId') ?? undefined, departmentId: search.get('departmentId') ?? undefined }
      validateQuery(q)
      return builder(ctx, q)
    }),
  ),
]
