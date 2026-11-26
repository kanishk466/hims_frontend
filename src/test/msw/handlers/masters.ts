/**
 * HTTP-shaped twin of the old direct-call mock logic for every Masters area (departments,
 * doctors, schedules, leaves, services, tariffs, panels, drugs, value lists), matched against
 * hims-server's real /masters/* routes (see API_REFERENCE.md § Stage 2) so the real api/*.ts
 * code is exercised identically in tests and in dev/prod. Reuses _server.ts's own rule helpers
 * (requireClinic, findInClinic, conflict, notFound, validate, writeAudit, nowIso,
 * requirePermission) directly — authenticateFromRequest produces the same RequestContext shape,
 * so none of that logic is duplicated here.
 */
import { http, type HttpHandler } from 'msw'
import { todayIST } from '@/lib/dates'
import { dayBefore, lookupPrice, sameCombination, type PriceQuery } from '@/lib/pricing'
import { syncConsultationTariffs } from '@/mock/consultationTariffs'
import type { DbShape } from '@/mock/db'
import {
  COMMON_DEPARTMENTS,
  departmentInputSchema,
  doctorInputSchema,
  drugInputSchema,
  leaveInputSchema,
  panelInputSchema,
  scheduleInputSchema,
  serviceInputSchema,
  tariffInputSchema,
  type DepartmentInput,
  type DoctorInput,
  type DrugInput,
  type LeaveInput,
  type PanelInput,
  type ScheduleInput,
  type ServiceInput,
  type Tariff,
  type TariffInput,
  type TariffRow,
} from '@/types/masters'
import { VALUE_LIST_TYPES, valueListItemInputSchema, type ValueListItemInput } from '@/types/valueLists'
import { ApiError } from '@/api/client'
import { conflict, findInClinic, notFound, nowIso, requireClinic, requirePermission, validate, writeAudit, type RequestContext } from '@/api/_server'
import { authenticateFromRequest, respond, url } from './common.js'

const qBool = (u: URL, key: string) => u.searchParams.get(key) === 'true'

/* ============================== Departments ============================== */

function makeDeptCode(name: string, taken: Set<string>): string {
  const template = COMMON_DEPARTMENTS.find((d) => d.name.toLowerCase() === name.toLowerCase())?.code
  const base = template ?? (name.replace(/[^A-Za-z\s]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'DEPT')
  let code = base.length >= 2 ? base : `${base}X`
  for (let n = 2; taken.has(code); n++) code = `${base}${n}`
  return code
}

const departmentHandlers: HttpHandler[] = [
  http.get(url('/masters/departments'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.departments.view', 'masters.doctors.view', 'admin.setup.view'])
      const clinicId = requireClinic(ctx)
      const includeInactive = qBool(new URL(request.url), 'includeInactive')
      return ctx.db.departments
        .filter((d) => d.clinicId === clinicId && (includeInactive || d.active))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
    }),
  ),

  http.post(url('/masters/departments'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.departments.create')
      const data = validate(departmentInputSchema, raw)
      const clinicId = requireClinic(ctx)
      const mine = ctx.db.departments.filter((d) => d.clinicId === clinicId)
      const same = mine.find((d) => d.name.toLowerCase() === data.name.toLowerCase())
      if (same?.active) conflict('name', `${same.name} already exists.`)
      if (same) {
        same.active = true
        same.updatedAt = nowIso()
        writeAudit(ctx, { action: 'activate', entity: 'department', entityId: same.id, summary: `Reactivated department ${same.name}` })
        return same
      }
      const codes = new Set(mine.map((d) => d.code))
      if (data.code && codes.has(data.code)) conflict('code', `Code ${data.code} is already used.`)
      const at = nowIso()
      const dept = {
        id: crypto.randomUUID(),
        clinicId,
        name: data.name,
        code: data.code ?? makeDeptCode(data.name, codes),
        type: data.type,
        queueColor: data.queueColor,
        casualty: data.casualty,
        sortOrder: mine.length + 1,
        active: true,
        createdAt: at,
        updatedAt: at,
      }
      ctx.db.departments.push(dept)
      writeAudit(ctx, { action: 'create', entity: 'department', entityId: dept.id, summary: `Added department ${dept.name}`, after: dept })
      return dept
    }, 201)
  }),

  http.patch(url('/masters/departments/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.departments.edit')
      const data: DepartmentInput = validate(departmentInputSchema, raw)
      const dept = findInClinic(ctx.db.departments, ctx, params.id as string, 'Department')
      const others = ctx.db.departments.filter((d) => d.clinicId === dept.clinicId && d.id !== dept.id)
      if (others.some((d) => d.name.toLowerCase() === data.name.toLowerCase())) conflict('name', 'Another department has this name.')
      if (data.code && others.some((d) => d.code === data.code)) conflict('code', `Code ${data.code} is already used.`)
      Object.assign(dept, { ...data, code: data.code ?? dept.code, updatedAt: nowIso() })
      writeAudit(ctx, { action: 'edit', entity: 'department', entityId: dept.id, summary: `Edited department ${dept.name}` })
      return dept
    })
  }),

  http.post(url('/masters/departments/:id/activate'), async ({ request, params }) => {
    const { active } = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, active ? 'masters.departments.edit' : 'masters.departments.cancel')
      const dept = findInClinic(ctx.db.departments, ctx, params.id as string, 'Department')
      if (!active) {
        const n = ctx.db.doctors.filter((d) => d.departmentId === dept.id && d.active).length
        if (n) throw new ApiError(409, 'in_use', `${dept.name} has ${n} active doctor(s). Move or deactivate them first.`)
      }
      dept.active = active
      dept.updatedAt = nowIso()
      writeAudit(ctx, { action: active ? 'activate' : 'deactivate', entity: 'department', entityId: dept.id, summary: `${active ? 'Reactivated' : 'Deactivated'} department ${dept.name}` })
      return dept
    })
  }),

  http.post(url('/masters/departments/:id/move'), async ({ request, params }) => {
    const { direction } = (await request.json()) as { direction: 'up' | 'down' }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.departments.edit')
      const dept = findInClinic(ctx.db.departments, ctx, params.id as string, 'Department')
      const list = ctx.db.departments.filter((d) => d.clinicId === dept.clinicId && d.active).sort((a, b) => a.sortOrder - b.sortOrder)
      list.forEach((d, i) => (d.sortOrder = i + 1))
      const i = list.indexOf(dept)
      const j = direction === 'up' ? i - 1 : i + 1
      if (j >= 0 && j < list.length) {
        const other = list[j]!
        ;[dept.sortOrder, other.sortOrder] = [other.sortOrder, dept.sortOrder]
      }
      return dept
    })
  }),
]

/* ================================ Doctors ================================ */

function checkDoctorRules(ctx: RequestContext, data: DoctorInput, selfId?: string) {
  const clinicId = requireClinic(ctx)
  const dept = ctx.db.departments.find((d) => d.id === data.departmentId && d.clinicId === clinicId && d.active)
  if (!dept) throw new ApiError(400, 'invalid', 'Choose an active department.', { departmentId: 'Choose an active department' })
  const dup = ctx.db.doctors.find(
    (d) => d.clinicId === clinicId && d.id !== selfId && d.registrationNo.replace(/\s/g, '').toLowerCase() === data.registrationNo.replace(/\s/g, '').toLowerCase(),
  )
  if (dup) conflict('registrationNo', `This registration number belongs to ${dup.name}.`)
}

const doctorHandlers: HttpHandler[] = [
  http.get(url('/masters/doctors'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.doctors.view', 'admin.setup.view', 'opd.queue.view', 'opd.appointments.view'])
      const clinicId = requireClinic(ctx)
      const includeInactive = qBool(new URL(request.url), 'includeInactive')
      return ctx.db.doctors
        .filter((d) => d.clinicId === clinicId && (includeInactive || d.active))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
    }),
  ),

  http.post(url('/masters/doctors'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.doctors.create')
      const data = validate(doctorInputSchema, raw)
      checkDoctorRules(ctx, data)
      const clinicId = requireClinic(ctx)
      const at = nowIso()
      const name = /^dr\.?\s/i.test(data.name) ? data.name.replace(/^dr\.?\s*/i, 'Dr. ') : `Dr. ${data.name}`
      const doctor = {
        ...data,
        name,
        mobile: data.mobile || undefined,
        id: crypto.randomUUID(),
        clinicId,
        sortOrder: ctx.db.doctors.filter((d) => d.clinicId === clinicId).length + 1,
        active: true,
        createdAt: at,
        updatedAt: at,
      }
      ctx.db.doctors.push(doctor)
      syncConsultationTariffs(ctx.db, doctor, ctx.user.id, todayIST())
      writeAudit(ctx, { action: 'create', entity: 'doctor', entityId: doctor.id, summary: `Added ${doctor.name}`, after: doctor })
      return doctor
    }, 201)
  }),

  http.patch(url('/masters/doctors/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.doctors.edit')
      const data = validate(doctorInputSchema, raw)
      const doctor = findInClinic(ctx.db.doctors, ctx, params.id as string, 'Doctor')
      checkDoctorRules(ctx, data, doctor.id)
      Object.assign(doctor, { ...data, mobile: data.mobile || undefined, updatedAt: nowIso() })
      syncConsultationTariffs(ctx.db, doctor, ctx.user.id, todayIST())
      writeAudit(ctx, { action: 'edit', entity: 'doctor', entityId: doctor.id, summary: `Edited ${doctor.name}` })
      return doctor
    })
  }),

  http.post(url('/masters/doctors/:id/activate'), async ({ request, params }) => {
    const { active } = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, active ? 'masters.doctors.edit' : 'masters.doctors.cancel')
      const doctor = findInClinic(ctx.db.doctors, ctx, params.id as string, 'Doctor')
      if (active) {
        const dept = ctx.db.departments.find((d) => d.id === doctor.departmentId)
        if (!dept?.active) throw new ApiError(409, 'parent_inactive', `Reactivate the ${dept?.name ?? ''} department first.`)
      }
      doctor.active = active
      doctor.updatedAt = nowIso()
      writeAudit(ctx, { action: active ? 'activate' : 'deactivate', entity: 'doctor', entityId: doctor.id, summary: `${active ? 'Reactivated' : 'Deactivated'} ${doctor.name}` })
      return doctor
    })
  }),
]

/* =============================== Schedules =============================== */

const overlapsSchedule = (a: Pick<ScheduleInput, 'weekdays' | 'start' | 'end'>, b: Pick<ScheduleInput, 'weekdays' | 'start' | 'end'>) =>
  a.weekdays.some((d) => b.weekdays.includes(d)) && a.start < b.end && b.start < a.end

function checkScheduleRules(ctx: RequestContext, data: ScheduleInput, selfId?: string) {
  const clinicId = requireClinic(ctx)
  const doctor = ctx.db.doctors.find((d) => d.id === data.doctorId && d.clinicId === clinicId && d.active)
  if (!doctor) throw new ApiError(400, 'invalid', 'Choose an active doctor.', { doctorId: 'Choose an active doctor' })
  const clash = ctx.db.schedules.find((s) => s.clinicId === clinicId && s.active && s.doctorId === data.doctorId && s.id !== selfId && overlapsSchedule(s, data))
  if (clash) throw new ApiError(409, 'overlap', `Overlaps ${doctor.name}’s ${clash.start}–${clash.end} session.`, { start: 'Overlaps another session of this doctor' })
}

const scheduleHandlers: HttpHandler[] = [
  http.get(url('/masters/schedules'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.schedules.view', 'admin.setup.view', 'opd.appointments.view'])
      const clinicId = requireClinic(ctx)
      const u = new URL(request.url)
      const doctorId = u.searchParams.get('doctorId') ?? undefined
      const includeInactive = qBool(u, 'includeInactive')
      return ctx.db.schedules
        .filter((s) => s.clinicId === clinicId && (includeInactive || s.active) && (!doctorId || s.doctorId === doctorId))
        .sort((a, b) => a.doctorId.localeCompare(b.doctorId) || a.start.localeCompare(b.start))
    }),
  ),

  http.post(url('/masters/schedules'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.schedules.create')
      const data = validate(scheduleInputSchema, raw)
      checkScheduleRules(ctx, data)
      const at = nowIso()
      const row = { ...data, room: data.room || undefined, id: crypto.randomUUID(), clinicId: requireClinic(ctx), active: true, createdAt: at, updatedAt: at }
      ctx.db.schedules.push(row)
      writeAudit(ctx, { action: 'create', entity: 'schedule', entityId: row.id, summary: `Added OPD session ${row.start}–${row.end}`, after: row })
      return row
    }, 201)
  }),

  http.patch(url('/masters/schedules/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.schedules.edit')
      const data = validate(scheduleInputSchema, raw)
      const row = findInClinic(ctx.db.schedules, ctx, params.id as string, 'Session')
      checkScheduleRules(ctx, data, row.id)
      Object.assign(row, { ...data, room: data.room || undefined, updatedAt: nowIso() })
      writeAudit(ctx, { action: 'edit', entity: 'schedule', entityId: row.id, summary: `Edited OPD session ${row.start}–${row.end}` })
      return row
    })
  }),

  http.post(url('/masters/schedules/:id/activate'), async ({ request, params }) => {
    const { active } = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, active ? 'masters.schedules.edit' : 'masters.schedules.cancel')
      const row = findInClinic(ctx.db.schedules, ctx, params.id as string, 'Session')
      if (active) checkScheduleRules(ctx, row, row.id)
      row.active = active
      row.updatedAt = nowIso()
      writeAudit(ctx, { action: active ? 'activate' : 'deactivate', entity: 'schedule', entityId: row.id, summary: `${active ? 'Restored' : 'Removed'} OPD session ${row.start}–${row.end}` })
      return row
    })
  }),
]

/* ================================ Leaves ================================= */

const leaveHandlers: HttpHandler[] = [
  http.get(url('/masters/leaves'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.schedules.view', 'opd.appointments.view'])
      const clinicId = requireClinic(ctx)
      const includePast = qBool(new URL(request.url), 'includePast')
      const today = todayIST()
      return ctx.db.leaves
        .filter((l) => l.clinicId === clinicId && l.active && (includePast || l.to >= today))
        .sort((a, b) => a.from.localeCompare(b.from))
    }),
  ),

  http.post(url('/masters/leaves'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.schedules.create')
      const data: LeaveInput = validate(leaveInputSchema, raw)
      const clinicId = requireClinic(ctx)
      if (data.doctorId && !ctx.db.doctors.some((d) => d.id === data.doctorId && d.clinicId === clinicId)) {
        throw new ApiError(400, 'invalid', 'Unknown doctor.', { doctorId: 'Choose a doctor from the list' })
      }
      const clash = ctx.db.leaves.find((l) => l.clinicId === clinicId && l.active && l.doctorId === data.doctorId && l.from <= data.to && data.from <= l.to)
      if (clash) throw new ApiError(409, 'overlap', `Overlaps an existing entry (${clash.reason}).`, { from: 'Overlaps an existing entry' })
      const leave = { ...data, id: crypto.randomUUID(), clinicId, active: true, createdAt: nowIso() }
      ctx.db.leaves.push(leave)
      const who = data.doctorId ? ctx.db.doctors.find((d) => d.id === data.doctorId)!.name : 'Whole hospital'
      writeAudit(ctx, { action: 'create', entity: 'leave', entityId: leave.id, summary: `${who}: off ${data.from} to ${data.to} (${data.reason})` })
      return leave
    }, 201)
  }),

  http.post(url('/masters/leaves/:id/cancel'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.schedules.cancel')
      const leave = findInClinic(ctx.db.leaves, ctx, params.id as string, 'Leave')
      leave.active = false
      writeAudit(ctx, { action: 'cancel', entity: 'leave', entityId: leave.id, summary: `Cancelled leave ${leave.from} to ${leave.to} (${leave.reason})` })
    }, 204),
  ),
]

/* ================================ Services ================================ */

function checkServiceRules(ctx: RequestContext, data: ServiceInput, selfId?: string) {
  const clinicId = requireClinic(ctx)
  if (ctx.db.services.some((s) => s.clinicId === clinicId && s.id !== selfId && s.code === data.code)) conflict('code', `Code ${data.code} is already used.`)
  if (data.departmentId && !ctx.db.departments.some((d) => d.id === data.departmentId && d.clinicId === clinicId)) {
    throw new ApiError(400, 'invalid', 'Unknown department.', { departmentId: 'Choose a department from the list' })
  }
  if (data.group === 'package') {
    const ok = (data.includedServiceIds ?? []).every((id) => ctx.db.services.some((s) => s.id === id && s.clinicId === clinicId && s.group !== 'package' && s.id !== selfId))
    if (!ok) throw new ApiError(400, 'invalid', 'A package can include only active, non-package services.', { includedServiceIds: 'Choose services from the list' })
  }
}

const cleanService = (d: ServiceInput): ServiceInput => ({
  ...d,
  departmentId: d.departmentId || null,
  sampleType: d.group === 'investigation' ? d.sampleType || null : null,
  includedServiceIds: d.group === 'package' ? d.includedServiceIds : undefined,
})

const serviceHandlers: HttpHandler[] = [
  http.get(url('/masters/services'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.services.view', 'masters.tariffs.view', 'opd.billing.view', 'opd.orders.view', 'masters.panels.view'])
      const clinicId = requireClinic(ctx)
      const includeInactive = qBool(new URL(request.url), 'includeInactive')
      const order = ['consultation', 'procedure', 'investigation', 'package', 'misc']
      return ctx.db.services
        .filter((s) => s.clinicId === clinicId && (includeInactive || s.active))
        .sort((a, b) => Number(b.active) - Number(a.active) || order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name))
    }),
  ),

  http.post(url('/masters/services'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.services.create')
      const data = cleanService(validate(serviceInputSchema, raw))
      checkServiceRules(ctx, data)
      const at = nowIso()
      const service = { ...data, id: crypto.randomUUID(), clinicId: requireClinic(ctx), auto: false, active: true, createdAt: at, updatedAt: at }
      ctx.db.services.push(service)
      writeAudit(ctx, { action: 'create', entity: 'service', entityId: service.id, summary: `Added service ${service.code} – ${service.name}`, after: service })
      return service
    }, 201)
  }),

  http.patch(url('/masters/services/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.services.edit')
      const data = cleanService(validate(serviceInputSchema, raw))
      const service = findInClinic(ctx.db.services, ctx, params.id as string, 'Service')
      if (service.auto && (data.code !== service.code || data.group !== service.group)) {
        throw new ApiError(409, 'locked', 'The OPD consultation service is used by doctor fees; its code and group cannot change.')
      }
      checkServiceRules(ctx, data, service.id)
      Object.assign(service, data, { updatedAt: nowIso() })
      writeAudit(ctx, { action: 'edit', entity: 'service', entityId: service.id, summary: `Edited service ${service.code} – ${service.name}` })
      return service
    })
  }),

  http.post(url('/masters/services/:id/activate'), async ({ request, params }) => {
    const { active } = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, active ? 'masters.services.edit' : 'masters.services.cancel')
      const service = findInClinic(ctx.db.services, ctx, params.id as string, 'Service')
      if (!active && service.auto) throw new ApiError(409, 'locked', 'The OPD consultation service cannot be deactivated.')
      if (!active) {
        const pkgs = ctx.db.services.filter((s) => s.active && s.includedServiceIds?.includes(service.id))
        if (pkgs.length) throw new ApiError(409, 'in_use', `Included in ${pkgs.map((p) => p.name).join(', ')}. Remove it from the package first.`)
      }
      service.active = active
      service.updatedAt = nowIso()
      writeAudit(ctx, { action: active ? 'activate' : 'deactivate', entity: 'service', entityId: service.id, summary: `${active ? 'Reactivated' : 'Deactivated'} service ${service.code}` })
      return service
    })
  }),
]

/* ================================ Tariffs ================================= */

function label(db: DbShape, clinicId: string, type: string, code: string | null) {
  if (!code) return null
  return db.valueListItems.find((v) => v.clinicId === clinicId && v.type === type && v.code === code)?.label ?? code
}

function payerName(db: DbShape, payerId: string | null) {
  if (!payerId) return null
  if (payerId === 'cash') return 'Cash (self-pay)'
  return db.panels.find((p) => p.id === payerId)?.name ?? payerId
}

function toRows(db: DbShape, clinicId: string, tariffs: Tariff[], today: string): TariffRow[] {
  const all = db.tariffs.filter((t) => t.clinicId === clinicId && t.status === 'approved')
  return tariffs.map((t) => {
    const next = all
      .filter((o) => o.id !== t.id && sameCombination(o, t) && o.validFrom > t.validFrom)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0]
    const validTo = t.status === 'approved' && next ? dayBefore(next.validFrom) : null
    const period: TariffRow['period'] = t.validFrom > today ? 'future' : validTo && validTo < today ? 'past' : 'current'
    const service = db.services.find((s) => s.id === t.serviceId)
    return {
      ...t,
      serviceName: service?.name ?? '?',
      serviceCode: service?.code ?? '?',
      doctorName: t.doctorId ? (db.doctors.find((d) => d.id === t.doctorId)?.name ?? '?') : null,
      payerName: payerName(db, t.payerId),
      visitTypeLabel: label(db, clinicId, 'visitType', t.visitType),
      categoryLabel: label(db, clinicId, 'patientCategory', t.patientCategory),
      validTo,
      period,
      createdByName: db.users.find((u) => u.id === t.createdBy)?.name ?? '?',
    }
  })
}

function checkTariffRefs(ctx: RequestContext, data: TariffInput) {
  const clinicId = requireClinic(ctx)
  const bad = (field: string, msg: string): never => {
    throw new ApiError(400, 'invalid', msg, { [field]: msg })
  }
  if (!ctx.db.services.some((s) => s.id === data.serviceId && s.clinicId === clinicId && s.active)) bad('serviceId', 'Choose an active service')
  if (data.doctorId && !ctx.db.doctors.some((d) => d.id === data.doctorId && d.clinicId === clinicId)) bad('doctorId', 'Choose a doctor from the list')
  if (data.payerId && data.payerId !== 'cash' && !ctx.db.panels.some((p) => p.id === data.payerId && p.clinicId === clinicId)) bad('payerId', 'Choose a payer from the list')
  for (const [field, type, value] of [['visitType', 'visitType', data.visitType], ['patientCategory', 'patientCategory', data.patientCategory]] as const) {
    if (value && !ctx.db.valueListItems.some((v) => v.clinicId === clinicId && v.type === type && v.code === value)) bad(field, 'Choose from the list')
  }
}

const tariffHandlers: HttpHandler[] = [
  http.get(url('/masters/tariffs/price-check'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.tariffs.view', 'opd.billing.view'])
      const clinicId = requireClinic(ctx)
      const u = new URL(request.url)
      const q: PriceQuery = {
        serviceId: u.searchParams.get('serviceId')!,
        date: u.searchParams.get('date')!,
        doctorId: u.searchParams.get('doctorId') ?? undefined,
        visitType: u.searchParams.get('visitType') ?? undefined,
        payerId: u.searchParams.get('payerId') ?? undefined,
        patientCategory: u.searchParams.get('patientCategory') ?? undefined,
      }
      const service = ctx.db.services.find((s) => s.id === q.serviceId && s.clinicId === clinicId) ?? notFound('Service')
      const panel = q.payerId && q.payerId !== 'cash' ? ctx.db.panels.find((p) => p.id === q.payerId && p.clinicId === clinicId) : null
      const tariffs = ctx.db.tariffs.filter((t) => t.clinicId === clinicId)
      const result = lookupPrice(q, service, tariffs, panel)
      const payer = panel ? panel.id : 'cash'
      const candidates = tariffs.filter(
        (t) =>
          t.status === 'approved' &&
          t.serviceId === q.serviceId &&
          t.validFrom <= q.date &&
          (!t.doctorId || t.doctorId === q.doctorId) &&
          (!t.payerId || t.payerId === payer) &&
          (!t.visitType || t.visitType === q.visitType) &&
          (!t.patientCategory || t.patientCategory === q.patientCategory),
      )
      return { ...result, serviceName: service.name, defaultRatePaise: service.defaultRatePaise, candidates: toRows(ctx.db, clinicId, candidates, q.date) }
    }),
  ),

  http.get(url('/masters/tariffs'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.tariffs.view')
      const clinicId = requireClinic(ctx)
      const u = new URL(request.url)
      const serviceId = u.searchParams.get('serviceId') ?? undefined
      const doctorId = u.searchParams.get('doctorId') ?? undefined
      const payerId = u.searchParams.get('payerId') ?? undefined
      const history = qBool(u, 'history')
      const list = ctx.db.tariffs.filter(
        (t) =>
          t.clinicId === clinicId &&
          (!serviceId || t.serviceId === serviceId) &&
          (!doctorId || t.doctorId === doctorId) &&
          (!payerId || (payerId === 'any' ? !t.payerId : t.payerId === payerId)) &&
          (history || t.status !== 'cancelled'),
      )
      const rows = toRows(ctx.db, clinicId, list, todayIST()).filter((r) => history || r.period !== 'past')
      const rank = { pending: 0, approved: 1, cancelled: 2 }
      return rows.sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          a.serviceName.localeCompare(b.serviceName) ||
          (a.doctorName ?? '').localeCompare(b.doctorName ?? '') ||
          (a.payerName ?? '').localeCompare(b.payerName ?? '') ||
          (a.visitTypeLabel ?? '').localeCompare(b.visitTypeLabel ?? '') ||
          b.validFrom.localeCompare(a.validFrom),
      )
    }),
  ),

  http.post(url('/masters/tariffs'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.tariffs.create')
      const data = validate(tariffInputSchema, raw)
      checkTariffRefs(ctx, data)
      const clinicId = requireClinic(ctx)
      const t0 = { ...data, note: data.note || undefined } as Tariff
      const dup = ctx.db.tariffs.find((t) => t.clinicId === clinicId && t.status !== 'cancelled' && sameCombination(t, t0) && t.validFrom === data.validFrom)
      if (dup) throw new ApiError(409, 'duplicate', 'A rate for exactly this combination already starts on that date.', { validFrom: 'Pick another start date, or cancel the other rate' })
      const canApprove = ctx.permissions.has('masters.tariffs.approve')
      const at = nowIso()
      const tariff: Tariff = {
        ...t0,
        id: crypto.randomUUID(),
        clinicId,
        status: canApprove ? 'approved' : 'pending',
        createdBy: ctx.user.id,
        createdAt: at,
        approvedBy: canApprove ? ctx.user.id : undefined,
        approvedAt: canApprove ? at : undefined,
      }
      ctx.db.tariffs.push(tariff)
      const row = toRows(ctx.db, clinicId, [tariff], todayIST())[0]!
      writeAudit(ctx, {
        action: 'create',
        entity: 'tariff',
        entityId: tariff.id,
        summary: `${canApprove ? 'Added' : 'Proposed'} rate ₹${(tariff.amountPaise / 100).toFixed(2)} for ${row.serviceName}${row.doctorName ? ` · ${row.doctorName}` : ''}${row.payerName ? ` · ${row.payerName}` : ''} from ${tariff.validFrom}`,
      })
      return row
    }, 201)
  }),

  http.post(url('/masters/tariffs/:id/approve'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.tariffs.approve')
      const t = findInClinic(ctx.db.tariffs, ctx, params.id as string, 'Rate')
      if (t.status !== 'pending') throw new ApiError(409, 'not_pending', 'Only pending rates can be approved.')
      const dup = ctx.db.tariffs.find((o) => o.id !== t.id && o.clinicId === t.clinicId && o.status === 'approved' && sameCombination(o, t) && o.validFrom === t.validFrom)
      if (dup) throw new ApiError(409, 'duplicate', 'An approved rate already starts on that date for this combination.')
      t.status = 'approved'
      t.approvedBy = ctx.user.id
      t.approvedAt = nowIso()
      const row = toRows(ctx.db, t.clinicId, [t], todayIST())[0]!
      writeAudit(ctx, { action: 'edit', entity: 'tariff', entityId: t.id, summary: `Approved rate ₹${(t.amountPaise / 100).toFixed(2)} for ${row.serviceName} from ${t.validFrom}` })
      return row
    }, 201),
  ),

  http.post(url('/masters/tariffs/:id/cancel'), async ({ request, params }) => {
    const { reason } = (await request.json()) as { reason: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.tariffs.cancel')
      const t = findInClinic(ctx.db.tariffs, ctx, params.id as string, 'Rate')
      if (!reason.trim()) throw new ApiError(400, 'invalid', 'Enter a reason.', { reason: 'Enter a reason' })
      if (t.status === 'cancelled') return { ok: true }
      if (t.status === 'approved' && t.validFrom <= todayIST()) {
        throw new ApiError(409, 'in_effect', 'This rate is already in use. To change it, add a new rate from a later date (“Change rate”).')
      }
      t.status = 'cancelled'
      t.cancelReason = reason.trim()
      writeAudit(ctx, { action: 'cancel', entity: 'tariff', entityId: t.id, summary: `Cancelled rate from ${t.validFrom}: ${reason.trim()}` })
      return { ok: true }
    }, 201)
  }),
]

/* ================================= Panels ================================= */

function checkPanelRules(ctx: RequestContext, data: PanelInput, selfId?: string) {
  const clinicId = requireClinic(ctx)
  if (ctx.db.panels.some((p) => p.clinicId === clinicId && p.id !== selfId && p.code === data.code)) conflict('code', `Code ${data.code} is already used.`)
  if (data.parentId) {
    if (data.parentId === selfId) throw new ApiError(400, 'invalid', 'A panel cannot be its own parent.', { parentId: 'Choose another panel' })
    if (!ctx.db.panels.some((p) => p.id === data.parentId && p.clinicId === clinicId)) throw new ApiError(400, 'invalid', 'Unknown parent.', { parentId: 'Choose a panel from the list' })
  }
}

const panelHandlers: HttpHandler[] = [
  http.get(url('/masters/panels'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.panels.view', 'masters.tariffs.view', 'opd.billing.view', 'opd.checkin.view'])
      const clinicId = requireClinic(ctx)
      const includeInactive = qBool(new URL(request.url), 'includeInactive')
      return ctx.db.panels.filter((p) => p.clinicId === clinicId && (includeInactive || p.active)).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
    }),
  ),

  http.post(url('/masters/panels'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.panels.create')
      const data = validate(panelInputSchema, raw)
      checkPanelRules(ctx, data)
      const at = nowIso()
      const panel = { ...data, parentId: data.parentId || null, id: crypto.randomUUID(), clinicId: requireClinic(ctx), active: true, createdAt: at, updatedAt: at }
      ctx.db.panels.push(panel)
      writeAudit(ctx, { action: 'create', entity: 'panel', entityId: panel.id, summary: `Added panel ${panel.name}`, after: panel })
      return panel
    }, 201)
  }),

  http.patch(url('/masters/panels/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.panels.edit')
      const data = validate(panelInputSchema, raw)
      const panel = findInClinic(ctx.db.panels, ctx, params.id as string, 'Panel')
      checkPanelRules(ctx, data, panel.id)
      Object.assign(panel, data, { parentId: data.parentId || null, updatedAt: nowIso() })
      writeAudit(ctx, { action: 'edit', entity: 'panel', entityId: panel.id, summary: `Edited panel ${panel.name}` })
      return panel
    })
  }),

  http.post(url('/masters/panels/:id/activate'), async ({ request, params }) => {
    const { active } = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, active ? 'masters.panels.edit' : 'masters.panels.cancel')
      const panel = findInClinic(ctx.db.panels, ctx, params.id as string, 'Panel')
      if (!active && ctx.db.panels.some((p) => p.parentId === panel.id && p.active)) {
        throw new ApiError(409, 'in_use', 'Active panels are linked to this one. Deactivate or move them first.')
      }
      panel.active = active
      panel.updatedAt = nowIso()
      writeAudit(ctx, { action: active ? 'activate' : 'deactivate', entity: 'panel', entityId: panel.id, summary: `${active ? 'Reactivated' : 'Deactivated'} panel ${panel.name}` })
      return panel
    })
  }),
]

/* ================================= Drugs ================================== */

function checkDrugRules(ctx: RequestContext, data: DrugInput, selfId?: string) {
  const clinicId = requireClinic(ctx)
  const key = (d: DrugInput) => `${d.brand}|${d.strength}|${d.form}`.toLowerCase().replace(/\s/g, '')
  if (ctx.db.drugs.some((d) => d.clinicId === clinicId && d.id !== selfId && key(d) === key(data))) conflict('brand', 'This brand, strength and form already exist.')
}

const drugHandlers: HttpHandler[] = [
  http.get(url('/masters/drugs/generics'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.drugs.view', 'opd.prescription.view'])
      const clinicId = requireClinic(ctx)
      return [...new Set(ctx.db.drugs.filter((d) => d.clinicId === clinicId).map((d) => d.generic))].sort()
    }),
  ),

  http.get(url('/masters/drugs'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['masters.drugs.view', 'opd.prescription.view'])
      const clinicId = requireClinic(ctx)
      const u = new URL(request.url)
      const q = u.searchParams.get('q')?.trim().toLowerCase()
      const schedule = u.searchParams.get('schedule') ?? undefined
      const includeInactive = qBool(u, 'includeInactive')
      const page = Math.max(1, Number(u.searchParams.get('page') ?? '1'))
      const pageSize = Number(u.searchParams.get('pageSize') ?? '25')
      const rows = ctx.db.drugs
        .filter(
          (d) =>
            d.clinicId === clinicId &&
            (includeInactive || d.active) &&
            (!schedule || d.schedule === schedule || (schedule === 'highAlert' && d.highAlert)) &&
            (!q || d.brand.toLowerCase().includes(q) || d.generic.toLowerCase().includes(q)),
        )
        .sort((a, b) => {
          const pa = q && a.brand.toLowerCase().startsWith(q) ? 0 : 1
          const pb = q && b.brand.toLowerCase().startsWith(q) ? 0 : 1
          return pa - pb || Number(b.active) - Number(a.active) || a.brand.localeCompare(b.brand)
        })
      return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
    }),
  ),

  http.post(url('/masters/drugs'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.drugs.create')
      const data = validate(drugInputSchema, raw)
      checkDrugRules(ctx, data)
      const at = nowIso()
      const drug = { ...data, id: crypto.randomUUID(), clinicId: requireClinic(ctx), active: true, createdAt: at, updatedAt: at }
      ctx.db.drugs.push(drug)
      writeAudit(ctx, { action: 'create', entity: 'drug', entityId: drug.id, summary: `Added drug ${drug.brand} ${drug.strength}` })
      return drug
    }, 201)
  }),

  http.patch(url('/masters/drugs/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.drugs.edit')
      const data = validate(drugInputSchema, raw)
      const drug = findInClinic(ctx.db.drugs, ctx, params.id as string, 'Drug')
      checkDrugRules(ctx, data, drug.id)
      Object.assign(drug, data, { updatedAt: nowIso() })
      writeAudit(ctx, { action: 'edit', entity: 'drug', entityId: drug.id, summary: `Edited drug ${drug.brand} ${drug.strength}` })
      return drug
    })
  }),

  http.post(url('/masters/drugs/:id/activate'), async ({ request, params }) => {
    const { active } = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, active ? 'masters.drugs.edit' : 'masters.drugs.cancel')
      const drug = findInClinic(ctx.db.drugs, ctx, params.id as string, 'Drug')
      drug.active = active
      drug.updatedAt = nowIso()
      writeAudit(ctx, { action: active ? 'activate' : 'deactivate', entity: 'drug', entityId: drug.id, summary: `${active ? 'Reactivated' : 'Deactivated'} drug ${drug.brand}` })
      return drug
    })
  }),
]

/* =============================== Value lists ============================== */

const typeDef = (type: string) => VALUE_LIST_TYPES.find((t) => t.key === type) ?? notFound('List')

function cleanMeta(type: string, meta: ValueListItemInput['meta']): ValueListItemInput['meta'] {
  const out: ValueListItemInput['meta'] = {}
  for (const f of typeDef(type).fields) {
    const v = meta[f.key]
    if (f.type === 'number') out[f.key] = Number(v ?? 0) || 0
    else if (f.type === 'boolean') out[f.key] = !!v
    else out[f.key] = String(v ?? f.options[0]?.value ?? '')
  }
  return out
}

const valueListHandlers: HttpHandler[] = [
  http.get(url('/masters/value-lists/counts'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.valueLists.view')
      const clinicId = requireClinic(ctx)
      const out: Record<string, number> = {}
      for (const v of ctx.db.valueListItems) if (v.clinicId === clinicId && v.active) out[v.type] = (out[v.type] ?? 0) + 1
      return out
    }),
  ),

  http.get(url('/masters/value-lists/:type'), ({ request, params }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      const clinicId = requireClinic(ctx)
      const type = params.type as string
      typeDef(type)
      const includeInactive = qBool(new URL(request.url), 'includeInactive')
      if (includeInactive && !ctx.permissions.has('masters.valueLists.view')) throw new ApiError(403, 'forbidden', 'You do not have permission to do this.')
      return ctx.db.valueListItems
        .filter((v) => v.clinicId === clinicId && v.type === type && (includeInactive || v.active))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
    }),
  ),

  http.post(url('/masters/value-lists/:type'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.valueLists.create')
      const data = validate(valueListItemInputSchema, raw)
      const clinicId = requireClinic(ctx)
      const type = params.type as string
      const def = typeDef(type)
      const mine = ctx.db.valueListItems.filter((v) => v.clinicId === clinicId && v.type === type)
      if (mine.some((v) => v.code.toLowerCase() === data.code.toLowerCase())) conflict('code', `Code ${data.code} is already used in ${def.label}.`)
      if (mine.some((v) => v.active && v.label.toLowerCase() === data.label.toLowerCase())) conflict('label', `${data.label} is already in the list.`)
      const item = { ...data, meta: cleanMeta(type, data.meta), id: crypto.randomUUID(), clinicId, type, sortOrder: mine.length + 1, active: true, locked: false }
      ctx.db.valueListItems.push(item)
      writeAudit(ctx, { action: 'create', entity: 'valueList', entityId: item.id, summary: `Added “${item.label}” to ${def.label}` })
      return item
    }, 201)
  }),

  http.patch(url('/masters/value-lists/items/:id'), async ({ request, params }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.valueLists.edit')
      const data = validate(valueListItemInputSchema, raw)
      const item = findInClinic(ctx.db.valueListItems, ctx, params.id as string, 'Item')
      if (item.locked && data.code !== item.code) throw new ApiError(409, 'locked', 'This code is used by the system and cannot change. You can still rename it.', { code: 'Used by the system' })
      const others = ctx.db.valueListItems.filter((v) => v.clinicId === item.clinicId && v.type === item.type && v.id !== item.id)
      if (others.some((v) => v.code.toLowerCase() === data.code.toLowerCase())) conflict('code', `Code ${data.code} is already used.`)
      Object.assign(item, { code: data.code, label: data.label, meta: cleanMeta(item.type, data.meta) })
      writeAudit(ctx, { action: 'edit', entity: 'valueList', entityId: item.id, summary: `Edited “${item.label}” in ${typeDef(item.type).label}` })
      return item
    })
  }),

  http.post(url('/masters/value-lists/items/:id/activate'), async ({ request, params }) => {
    const { active } = (await request.json()) as { active: boolean }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, active ? 'masters.valueLists.edit' : 'masters.valueLists.cancel')
      const item = findInClinic(ctx.db.valueListItems, ctx, params.id as string, 'Item')
      if (!active && item.locked) throw new ApiError(409, 'locked', `“${item.label}” is used by the system and cannot be deactivated.`)
      item.active = active
      writeAudit(ctx, { action: active ? 'activate' : 'deactivate', entity: 'valueList', entityId: item.id, summary: `${active ? 'Reactivated' : 'Deactivated'} “${item.label}” in ${typeDef(item.type).label}` })
      return item
    })
  }),

  http.post(url('/masters/value-lists/items/:id/move'), async ({ request, params }) => {
    const { direction } = (await request.json()) as { direction: 'up' | 'down' }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'masters.valueLists.edit')
      const item = findInClinic(ctx.db.valueListItems, ctx, params.id as string, 'Item')
      const list = ctx.db.valueListItems.filter((v) => v.clinicId === item.clinicId && v.type === item.type && v.active).sort((a, b) => a.sortOrder - b.sortOrder)
      list.forEach((v, i) => (v.sortOrder = i + 1))
      const i = list.indexOf(item)
      const other = list[direction === 'up' ? i - 1 : i + 1]
      if (other) [item.sortOrder, other.sortOrder] = [other.sortOrder, item.sortOrder]
      return { ok: true }
    }, 201)
  }),
]

export const mastersHandlers: HttpHandler[] = [
  ...departmentHandlers,
  ...doctorHandlers,
  ...scheduleHandlers,
  ...leaveHandlers,
  ...serviceHandlers,
  ...tariffHandlers,
  ...panelHandlers,
  ...drugHandlers,
  ...valueListHandlers,
]
