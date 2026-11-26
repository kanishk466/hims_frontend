import { z } from 'zod'
import { CLINIC_CODE_RE, GSTIN_RE, mobileSchema, optionalEmail, optionalPattern, PAN_RE, phoneSchema, pinCodeSchema } from '@/lib/validators'
import type { IsoDateTime } from './common'
import type { OpdSettings } from './opd'

export const PLANS = ['trial', 'starter', 'pro'] as const
export type Plan = (typeof PLANS)[number]
export const PLAN_LABELS: Record<Plan, string> = { trial: 'Trial (14 days)', starter: 'OPD Starter', pro: 'OPD Pro' }

export const CLINIC_STATUSES = ['trial', 'active', 'suspended'] as const
export type ClinicStatus = (typeof CLINIC_STATUSES)[number]

export const NABH_STATUSES = ['none', 'entry', 'full'] as const
export const NABH_LABELS: Record<(typeof NABH_STATUSES)[number], string> = {
  none: 'Not accredited',
  entry: 'NABH entry level',
  full: 'NABH full accreditation',
}

/** Wizard step 1: hospital profile. Also the clinic settings screen afterwards. */
export const clinicProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter the name patients know you by'),
  legalName: z.string().trim().min(2, 'Enter the registered legal name'),
  addressLine: z.string().trim().min(5, 'Enter the street address'),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().min(2, 'Choose the state'),
  pinCode: pinCodeSchema,
  phone: phoneSchema,
  email: optionalEmail,
  registrationNo: z.string().trim().min(2, 'Enter the hospital registration number'),
  financialYearStartMonth: z.number().int().min(1).max(12),
  gstin: optionalPattern(GSTIN_RE, 'GSTIN is 15 characters, e.g. 27AAKCS4821M1Z5'),
  pan: optionalPattern(PAN_RE, 'PAN is 10 characters, e.g. AAKCS4821M'),
  hfrId: z.string().trim().optional(),
  nabhStatus: z.enum(NABH_STATUSES),
  website: z.string().trim().optional(),
  /** Small image as a data URL (mock only; real system uploads to S3). */
  logoDataUrl: z.string().optional(),
})
export type ClinicProfile = z.infer<typeof clinicProfileSchema>

export interface Clinic extends ClinicProfile {
  id: string
  /** Subdomain and default UHID prefix source: "sunrise" → sunrise.yourhms.in */
  code: string
  uhidPrefix: string
  plan: Plan
  status: ClinicStatus
  trialEndsAt?: IsoDateTime
  beds: number
  createdAt: IsoDateTime
  setupCompletedAt?: IsoDateTime
  opdSettings: OpdSettings
  /** Set the first time the services & tariffs setup step is marked reviewed. */
  servicesReviewedAt?: IsoDateTime
  printSettings: PrintSettings
  /** Set the first time the print & branding setup step is saved. */
  printConfiguredAt?: IsoDateTime
  integrations: IntegrationSettings
  /** Set the first time the integrations setup step is saved. */
  integrationsConfiguredAt?: IsoDateTime
  messageTemplates: MessageTemplates
  /** "Getting started" card on the admin dashboard. */
  gettingStarted?: { rolesReviewedAt?: IsoDateTime; hiddenAt?: IsoDateTime }
}

/* ---------- Print & branding (wizard step 7 / Clinic settings) ---------- */

export const PAPER_SIZES = ['A4', 'A5', 'thermal80mm'] as const
export const PAPER_SIZE_LABELS: Record<(typeof PAPER_SIZES)[number], string> = { A4: 'A4', A5: 'A5 (half sheet)', thermal80mm: 'Thermal, 80 mm' }

export const printSettingsSchema = z.object({
  paperSize: z.enum(PAPER_SIZES),
  showLogoOnPrints: z.boolean(),
  footerNote: z.string().trim().max(160, 'Keep it under 160 characters').optional(),
})
export type PrintSettings = z.infer<typeof printSettingsSchema>
export const DEFAULT_PRINT_SETTINGS: PrintSettings = { paperSize: 'A4', showLogoOnPrints: true, footerNote: 'Thank you for choosing us. Get well soon!' }

/* ---------- Integrations (wizard step 8 / Clinic settings): all simulated ---------- */

export const integrationSettingsSchema = z.object({
  abdmEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  upiEnabled: z.boolean(),
})
export type IntegrationSettings = z.infer<typeof integrationSettingsSchema>
export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = { abdmEnabled: false, smsEnabled: false, whatsappEnabled: false, upiEnabled: true }

/* ---------- Message templates (SMS/WhatsApp, simulated): Integrations step ---------- */

export const MESSAGE_EVENTS = ['billReceipt', 'appointmentReminder'] as const
export type MessageEvent = (typeof MESSAGE_EVENTS)[number]
export const MESSAGE_EVENT_LABELS: Record<MessageEvent, string> = { billReceipt: 'Bill receipt', appointmentReminder: 'Appointment reminder' }
/** Placeholders a template body may use; substituted when a message is sent. */
export const MESSAGE_PLACEHOLDERS: Record<MessageEvent, string[]> = {
  billReceipt: ['patientName', 'clinicName', 'billNo', 'amount'],
  appointmentReminder: ['patientName', 'clinicName', 'doctorName', 'date', 'time'],
}

export const messageTemplatesSchema = z.object({
  billReceipt: z.string().trim().max(400),
  appointmentReminder: z.string().trim().max(400),
})
export type MessageTemplates = z.infer<typeof messageTemplatesSchema>
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
  billReceipt: 'Dear {patientName}, thank you for visiting {clinicName}. Bill {billNo}: amount paid Rs.{amount}. Get well soon!',
  appointmentReminder: 'Dear {patientName}, this is a reminder of your appointment with {doctorName} at {clinicName} on {date} at {time}.',
}

/** Super-admin "Create clinic" form. */
export const createClinicSchema = z.object({
  name: z.string().trim().min(3, 'Enter the clinic or hospital name'),
  code: z
    .string()
    .trim()
    .regex(CLINIC_CODE_RE, '3–20 lowercase letters, numbers or hyphens, starting with a letter'),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().min(2, 'Choose the state'),
  plan: z.enum(PLANS),
  beds: z.number({ error: 'Enter the number of beds' }).int().min(0).max(1000),
  adminName: z.string().trim().min(3, 'Enter the admin’s full name'),
  adminMobile: mobileSchema,
  adminEmail: z.email('Enter a valid email address'),
})
export type CreateClinicInput = z.infer<typeof createClinicSchema>

export const updateClinicSchema = z.object({
  name: z.string().trim().min(3),
  plan: z.enum(PLANS),
  status: z.enum(CLINIC_STATUSES),
  beds: z.number().int().min(0).max(1000),
})
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>

/** One row of Platform → Clinics. */
export interface ClinicSummary {
  id: string
  code: string
  name: string
  city: string
  state: string
  plan: Plan
  status: ClinicStatus
  beds: number
  trialEndsAt?: IsoDateTime
  createdAt: IsoDateTime
  setup: { done: number; required: number }
  admin: { id: string; name: string; status: 'invited' | 'active' | 'inactive'; inviteToken?: string } | null
  counts: { users: number; doctors: number }
}

export interface ProvisionResult {
  clinic: ClinicSummary
  steps: { label: string; detail: string }[]
  inviteToken: string
  inviteExpiresAt: IsoDateTime
}

export const SETUP_STEPS = [
  { key: 'profile', label: 'Hospital profile', required: true },
  { key: 'departments', label: 'Departments', required: true },
  { key: 'doctors', label: 'Doctors', required: true },
  { key: 'schedules', label: 'Doctor schedules', required: true },
  { key: 'users', label: 'Users and roles', required: true },
  { key: 'services', label: 'Services and tariffs', required: false },
  { key: 'print', label: 'Print and branding', required: false },
  { key: 'integrations', label: 'Integrations', required: false },
] as const
export type SetupStepKey = (typeof SETUP_STEPS)[number]['key']

export interface SetupStepStatus {
  key: SetupStepKey
  label: string
  required: boolean
  done: boolean
  /** Plain-English reason when not done, e.g. "Add at least one doctor". */
  hint: string
  /** Build step in which this wizard step's screen arrives, if not yet available. */
  availableInStep?: number
}

export interface SetupProgress {
  steps: SetupStepStatus[]
  requiredDone: number
  requiredTotal: number
  complete: boolean
}
