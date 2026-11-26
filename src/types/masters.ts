import { z } from 'zod'
import { mobileSchema, TIME_RE } from '@/lib/validators'
import type { IsoDateTime } from './common'

/* ---------- Departments ---------- */

export const DEPARTMENT_TYPES = ['clinical', 'nonClinical'] as const

export const departmentInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter the department name'),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,8}$/, '2–8 capital letters or numbers, e.g. GM')
    .optional(),
  type: z.enum(DEPARTMENT_TYPES),
  queueColor: z.string().min(1),
  /** Casualty / emergency: its doctors take emergency registrations with E-tokens (OPD-14). */
  casualty: z.boolean().optional(),
})
export type DepartmentInput = z.infer<typeof departmentInputSchema>

export interface Department extends Required<Omit<DepartmentInput, 'casualty'>> {
  casualty?: boolean
  id: string
  clinicId: string
  sortOrder: number
  active: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/* ---------- Doctors ---------- */

export const DOCTOR_TYPES = ['fullTime', 'visiting'] as const
export const DOCTOR_TYPE_LABELS: Record<(typeof DOCTOR_TYPES)[number], string> = {
  fullTime: 'Full-time',
  visiting: 'Visiting',
}

export const doctorInputSchema = z
  .object({
    name: z.string().trim().min(3, 'Enter the doctor’s full name'),
    departmentId: z.string({ error: 'Choose a department' }).min(1, 'Choose a department'),
    qualification: z.string().trim().min(2, 'Enter qualifications, e.g. MBBS, MD (Medicine)'),
    council: z.string({ error: 'Choose the medical council' }).min(2, 'Choose the medical council'),
    registrationNo: z.string().trim().min(3, 'Enter the council registration number'),
    feeNewPaise: z.number({ error: 'Enter the new-visit fee' }).int().min(0, 'Fee cannot be negative'),
    feeFollowUpPaise: z.number({ error: 'Enter the follow-up fee' }).int().min(0, 'Fee cannot be negative'),
    type: z.enum(DOCTOR_TYPES),
    mobile: z.union([z.literal(''), mobileSchema]).optional(),
  })
  .refine((d) => d.feeFollowUpPaise <= d.feeNewPaise, {
    path: ['feeFollowUpPaise'],
    message: 'Follow-up fee is usually not more than the new-visit fee',
  })
export type DoctorInput = z.infer<typeof doctorInputSchema>

export interface Doctor extends DoctorInput {
  id: string
  clinicId: string
  /** Login linked to this doctor (set from the user screen). */
  userId?: string
  sortOrder: number
  active: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/* ---------- Doctor schedules (one row = one recurring OPD session) ---------- */

export const SLOT_MINUTES = [5, 10, 15, 20, 30] as const

export const scheduleInputSchema = z
  .object({
    doctorId: z.string().min(1),
    /** 0 = Sunday … 6 = Saturday */
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day'),
    start: z.string().regex(TIME_RE, 'Enter a start time'),
    end: z.string().regex(TIME_RE, 'Enter an end time'),
    slotMinutes: z.number().int().min(5).max(60),
    maxPatients: z.number().int().min(1).max(200).optional(),
    walkInQuota: z.number().int().min(0).max(200).optional(),
    room: z.string().trim().optional(),
  })
  .refine((s) => s.end > s.start, { path: ['end'], message: 'End time must be after start time' })
  .refine((s) => s.walkInQuota === undefined || s.maxPatients === undefined || s.walkInQuota <= s.maxPatients, {
    path: ['walkInQuota'],
    message: 'Walk-in quota cannot be more than the maximum patients',
  })
export type ScheduleInput = z.infer<typeof scheduleInputSchema>

export interface DoctorSchedule extends ScheduleInput {
  id: string
  clinicId: string
  active: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** Slots in a session, e.g. 09:30–13:30 at 10 min = 24. */
export function slotCount(s: Pick<ScheduleInput, 'start' | 'end' | 'slotMinutes'>): number {
  const toMin = (t: string) => {
    const [h = 0, m = 0] = t.split(':').map(Number)
    return h * 60 + m
  }
  return Math.max(0, Math.floor((toMin(s.end) - toMin(s.start)) / s.slotMinutes))
}

/** Common departments offered as quick picks in the setup wizard (seed template). */
export const COMMON_DEPARTMENTS: { code: string; name: string; type: (typeof DEPARTMENT_TYPES)[number]; queueColor: string }[] = [
  { code: 'GM', name: 'General Medicine', type: 'clinical', queueColor: 'teal' },
  { code: 'PAED', name: 'Paediatrics', type: 'clinical', queueColor: 'pink' },
  { code: 'OBGY', name: 'Obstetrics & Gynaecology', type: 'clinical', queueColor: 'grape' },
  { code: 'ORTH', name: 'Orthopaedics', type: 'clinical', queueColor: 'orange' },
  { code: 'GS', name: 'General Surgery', type: 'clinical', queueColor: 'red' },
  { code: 'ENT', name: 'ENT', type: 'clinical', queueColor: 'cyan' },
  { code: 'OPH', name: 'Ophthalmology', type: 'clinical', queueColor: 'blue' },
  { code: 'DERM', name: 'Dermatology', type: 'clinical', queueColor: 'lime' },
  { code: 'CARD', name: 'Cardiology', type: 'clinical', queueColor: 'red' },
  { code: 'PULM', name: 'Pulmonology', type: 'clinical', queueColor: 'indigo' },
  { code: 'GAST', name: 'Gastroenterology', type: 'clinical', queueColor: 'yellow' },
  { code: 'NEPH', name: 'Nephrology', type: 'clinical', queueColor: 'violet' },
  { code: 'NEUR', name: 'Neurology', type: 'clinical', queueColor: 'grape' },
  { code: 'URO', name: 'Urology', type: 'clinical', queueColor: 'blue' },
  { code: 'PSY', name: 'Psychiatry', type: 'clinical', queueColor: 'violet' },
  { code: 'ENDO', name: 'Endocrinology', type: 'clinical', queueColor: 'orange' },
  { code: 'ONC', name: 'Oncology', type: 'clinical', queueColor: 'pink' },
  { code: 'DENT', name: 'Dental', type: 'clinical', queueColor: 'cyan' },
  { code: 'PHYS', name: 'Physiotherapy', type: 'clinical', queueColor: 'green' },
  { code: 'DIET', name: 'Dietetics', type: 'clinical', queueColor: 'lime' },
  { code: 'AYUSH', name: 'AYUSH', type: 'clinical', queueColor: 'green' },
  { code: 'EMER', name: 'Emergency / Casualty', type: 'clinical', queueColor: 'red' },
  { code: 'LAB', name: 'Laboratory', type: 'nonClinical', queueColor: 'gray' },
  { code: 'RAD', name: 'Radiology', type: 'nonClinical', queueColor: 'gray' },
]

export const QUEUE_COLORS = ['teal', 'blue', 'cyan', 'indigo', 'violet', 'grape', 'pink', 'red', 'orange', 'yellow', 'lime', 'green', 'gray'] as const

/* ---------- Doctor leave & hospital holidays ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const dateSchema = z.string().regex(DATE_RE, 'Pick a date')

export const leaveInputSchema = z
  .object({
    /** null = whole hospital (holiday) */
    doctorId: z.string().nullable(),
    from: dateSchema,
    to: dateSchema,
    reason: z.string().trim().min(2, 'Enter a reason, e.g. Conference, Diwali'),
  })
  .refine((l) => l.to >= l.from, { path: ['to'], message: 'End date cannot be before start date' })
export type LeaveInput = z.infer<typeof leaveInputSchema>

export interface Leave extends LeaveInput {
  id: string
  clinicId: string
  active: boolean
  createdAt: IsoDateTime
}

/* ---------- Services ---------- */

export const SERVICE_GROUPS = ['consultation', 'procedure', 'investigation', 'package', 'misc'] as const
export type ServiceGroup = (typeof SERVICE_GROUPS)[number]
export const SERVICE_GROUP_LABELS: Record<ServiceGroup, string> = {
  consultation: 'Consultation',
  procedure: 'Procedure',
  investigation: 'Investigation',
  package: 'Health package',
  misc: 'Miscellaneous',
}
export const GST_RATES = [0, 5, 12, 18] as const
export const SAMPLE_TYPES = ['Blood', 'Urine', 'Stool', 'Swab', 'Sputum', 'Imaging', 'Other'] as const

export const serviceInputSchema = z
  .object({
    code: z.string().trim().regex(/^[A-Z0-9-]{2,12}$/, '2–12 capital letters, numbers or hyphens, e.g. ECG'),
    name: z.string().trim().min(2, 'Enter the service name'),
    group: z.enum(SERVICE_GROUPS),
    departmentId: z.string().nullable().optional(),
    defaultRatePaise: z.number({ error: 'Enter the default rate' }).int().min(0),
    gstPercent: z.number().refine((v) => (GST_RATES as readonly number[]).includes(v), 'Choose a GST rate'),
    sac: z.string().trim().optional(),
    /** Cashier may type the price at billing time (e.g. dressing of varying size). */
    openPrice: z.boolean(),
    sampleType: z.string().optional().nullable(),
    includedServiceIds: z.array(z.string()).optional(),
  })
  .refine((s) => s.group !== 'package' || (s.includedServiceIds?.length ?? 0) > 0, {
    path: ['includedServiceIds'],
    message: 'A package must include at least one service',
  })
export type ServiceInput = z.infer<typeof serviceInputSchema>

export interface Service extends ServiceInput {
  id: string
  clinicId: string
  /** Created by the system (OPD consultation); rates come from doctor fees. */
  auto?: boolean
  active: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/* ---------- Tariffs (versioned rates) ---------- */

export const tariffInputSchema = z.object({
  serviceId: z.string({ error: 'Choose a service' }).min(1, 'Choose a service'),
  /** null = any value ("all doctors", "all payers"…) */
  doctorId: z.string().nullable(),
  visitType: z.string().nullable(),
  /** null = any payer; "cash" = self-pay only; otherwise a panel id */
  payerId: z.string().nullable(),
  patientCategory: z.string().nullable(),
  amountPaise: z.number({ error: 'Enter the rate' }).int().min(0),
  validFrom: dateSchema,
  note: z.string().trim().optional(),
})
export type TariffInput = z.infer<typeof tariffInputSchema>

export type TariffStatus = 'pending' | 'approved' | 'cancelled'

export interface Tariff extends TariffInput {
  id: string
  clinicId: string
  status: TariffStatus
  createdBy: string
  createdAt: IsoDateTime
  approvedBy?: string
  approvedAt?: IsoDateTime
  cancelReason?: string
}

/** Tariff row as listed, with names and its effective period. */
export interface TariffRow extends Tariff {
  serviceName: string
  serviceCode: string
  doctorName: string | null
  payerName: string | null
  visitTypeLabel: string | null
  categoryLabel: string | null
  /** Last day this version applies (day before the next version), if superseded. */
  validTo: string | null
  period: 'current' | 'future' | 'past'
  createdByName: string
}

/* ---------- Panels (corporate, TPA, insurer, government scheme) ---------- */

export const PANEL_TYPES = ['corporate', 'tpa', 'insurer', 'government', 'other'] as const
export const PANEL_TYPE_LABELS: Record<(typeof PANEL_TYPES)[number], string> = {
  corporate: 'Corporate',
  tpa: 'TPA',
  insurer: 'Insurer',
  government: 'Government scheme',
  other: 'Other',
}

export const panelInputSchema = z
  .object({
    code: z.string().trim().regex(/^[A-Z0-9-]{2,12}$/, '2–12 capital letters, numbers or hyphens'),
    name: z.string().trim().min(2, 'Enter the panel name'),
    type: z.enum(PANEL_TYPES),
    parentId: z.string().nullable().optional(),
    contactPerson: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
    address: z.string().trim().optional(),
    gstin: z.string().trim().optional(),
    contract: z.object({
      validFrom: dateSchema,
      validTo: dateSchema,
      rateBasis: z.enum(['panelTariff', 'hospitalTariff']),
      /** For hospitalTariff: e.g. -10 = 10% below hospital rates. */
      adjustPercent: z.number().min(-100).max(100),
      creditLimitPaise: z.number().int().min(0),
      creditDays: z.number().int().min(0).max(365),
      billingCycle: z.enum(['monthly', 'perVisit']),
    }),
    coverage: z.object({
      copayPercent: z.number().min(0).max(100),
      copayFixedPaise: z.number().int().min(0),
      excludedGroups: z.array(z.enum(SERVICE_GROUPS)),
      perVisitCapPaise: z.number().int().min(0),
    }),
    requirements: z.object({
      documents: z.array(z.string()),
      priorApproval: z.boolean(),
      approvalValidityDays: z.number().int().min(0).max(365),
    }),
  })
  .refine((p) => p.contract.validTo >= p.contract.validFrom, { path: ['contract', 'validTo'], message: 'Contract end must be after its start' })
export type PanelInput = z.infer<typeof panelInputSchema>

export interface Panel extends PanelInput {
  id: string
  clinicId: string
  active: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/* ---------- Drugs ---------- */

export const DRUG_SCHEDULES = ['none', 'H', 'H1', 'X'] as const
export const DRUG_SCHEDULE_LABELS: Record<(typeof DRUG_SCHEDULES)[number], string> = {
  none: 'OTC / none',
  H: 'Schedule H',
  H1: 'Schedule H1',
  X: 'Schedule X',
}

export const drugInputSchema = z.object({
  brand: z.string().trim().min(2, 'Enter the brand name'),
  generic: z.string().trim().min(2, 'Enter the generic (salt) name'),
  strength: z.string().trim().min(1, 'Enter the strength, e.g. 500 mg'),
  form: z.string().min(1, 'Choose the form'),
  manufacturer: z.string().trim().optional(),
  drugClass: z.string().trim().optional(),
  schedule: z.enum(DRUG_SCHEDULES),
  highAlert: z.boolean(),
})
export type DrugInput = z.infer<typeof drugInputSchema>

export interface Drug extends DrugInput {
  id: string
  clinicId: string
  active: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
