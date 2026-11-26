/**
 * OPD entities (OPD Spec → Core data entities). The Visit is the centre: vitals,
 * notes, prescription, orders and bills all hang off one visit.
 */
import { z } from 'zod'
import { mobileSchema, optionalEmail } from '@/lib/validators'
import type { IsoDateTime, Paise } from './common'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* ---------- Hospital OPD settings (OPD Spec → Business rules) ---------- */

export interface OpdSettings {
  /** Pay before consultation (default) or after. */
  paymentTiming: 'before' | 'after'
  /** Free follow-ups allowed inside the free window (visit type "freeFollowUp" validity). */
  freeFollowUpsAllowed: number
  /** Booked patients get priority tokens. */
  appointmentPriority: boolean
  /** Vitals before consultation: warning only (false) or required (true). */
  vitalsMandatory: boolean
  /** Cancel bills the same day only; later needs Clinic Admin. */
  billCancelSameDayOnly: boolean
  /** UPI id shown on the counter QR. */
  upiId: string
  /** Day-end: a cash shortage or excess above this needs a reason. */
  cashVarianceTolerancePaise: number
}

export const DEFAULT_OPD_SETTINGS: OpdSettings = {
  paymentTiming: 'before',
  freeFollowUpsAllowed: 1,
  appointmentPriority: true,
  vitalsMandatory: false,
  billCancelSameDayOnly: true,
  upiId: 'hospital@upi',
  cashVarianceTolerancePaise: 1000,
}

/* ---------- Patient ---------- */

export const GENDERS = ['M', 'F', 'O'] as const
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = { M: 'Male', F: 'Female', O: 'Other' }

export const patientInputSchema = z
  .object({
    salutation: z.string().optional(),
    name: z.string().trim().min(2, 'Enter the patient’s full name'),
    gender: z.enum(GENDERS, { error: 'Choose gender' }),
    /** Either an exact DOB, or an age that gives an approximate DOB. */
    dob: z.string().regex(DATE_RE, 'Enter date of birth or age'),
    dobApprox: z.boolean(),
    mobile: mobileSchema,
    altMobile: z.union([z.literal(''), mobileSchema]).optional(),
    email: optionalEmail,
    addressLine: z.string().trim().optional(),
    city: z.string().trim().optional(),
    pinCode: z.union([z.literal(''), z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code')]).optional(),
    bloodGroup: z.string().optional().nullable(),
    idProofType: z.string().optional().nullable(),
    idProofNo: z.string().trim().optional(),
    abhaNumber: z.union([z.literal(''), z.string().regex(/^\d{2}-\d{4}-\d{4}-\d{4}$/, 'ABHA number is 14 digits: 12-3456-7890-1234')]).optional(),
    guardianName: z.string().trim().optional(),
    guardianRelation: z.string().optional().nullable(),
    referralSource: z.string().optional().nullable(),
    category: z.string().min(1),
    allergies: z.array(z.string()),
    chronicConditions: z.array(z.string()),
    /** Confirm creating although possible duplicates were shown. */
    confirmNotDuplicate: z.boolean().optional(),
  })
  .refine((p) => p.dob <= new Date().toISOString().slice(0, 10), { path: ['dob'], message: 'Date of birth cannot be in the future' })
export type PatientInput = z.infer<typeof patientInputSchema>

export interface Patient extends Omit<PatientInput, 'confirmNotDuplicate'> {
  id: string
  clinicId: string
  uhid: string
  /** Emergency registration with minimal data (OPD-14): TMP- number until identified. */
  temporary?: boolean
  /** The TMP- number this record had before it was confirmed. */
  previousUhid?: string
  /** Merged into another record: this one is kept for history but hidden from search. */
  mergedIntoId?: string
  mergedAt?: IsoDateTime
  /** Simulated ABDM verification (needs Integrations → ABDM/ABHA on); cleared if the ABHA number changes. */
  abhaVerifiedAt?: IsoDateTime
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** Small patient card used across OPD screens. */
export interface PatientBrief {
  id: string
  uhid: string
  name: string
  gender: Patient['gender']
  dob: string
  dobApprox: boolean
  mobile: string
  category: string
  allergies: string[]
  lastVisitDate?: string
  temporary?: boolean
}

/* ---------- Appointment ---------- */

export const APPOINTMENT_STATUSES = ['booked', 'arrived', 'cancelled', 'noShow'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export const appointmentInputSchema = z.object({
  patientId: z.string().min(1, 'Choose a patient'),
  doctorId: z.string().min(1, 'Choose a doctor'),
  date: z.string().regex(DATE_RE),
  slot: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().trim().optional(),
})
export type AppointmentInput = z.infer<typeof appointmentInputSchema>

export interface Appointment extends AppointmentInput {
  id: string
  clinicId: string
  status: AppointmentStatus
  source: 'counter' | 'phone'
  visitId?: string
  cancelReason?: string
  history: { at: IsoDateTime; by: string; action: string }[]
  createdAt: IsoDateTime
}

export interface Slot {
  time: string
  scheduleId: string
  room?: string
  appointment?: Appointment & { patient: PatientBrief }
  /** Past slots of today can't be booked. */
  past: boolean
}

export interface DaySlots {
  doctorId: string
  date: string
  onLeave: string | null
  sessions: { scheduleId: string; start: string; end: string; room?: string; maxPatients?: number; walkInQuota?: number; booked: number; slots: Slot[] }[]
}

/* ---------- Visit ---------- */

export const VISIT_STATUSES = ['checkedIn', 'billed', 'vitalsDone', 'inConsultation', 'completed', 'cancelled', 'noShow'] as const
export type VisitStatus = (typeof VISIT_STATUSES)[number]
export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  checkedIn: 'Checked in',
  billed: 'Billed',
  vitalsDone: 'Vitals done',
  inConsultation: 'In consultation',
  completed: 'Completed',
  cancelled: 'Cancelled',
  noShow: 'No-show',
}
export const VISIT_STATUS_COLORS: Record<VisitStatus, string> = {
  checkedIn: 'gray',
  billed: 'blue',
  vitalsDone: 'cyan',
  inConsultation: 'orange',
  completed: 'teal',
  cancelled: 'red',
  noShow: 'red',
}

export const checkInInputSchema = z.object({
  patientId: z.string().min(1, 'Choose a patient'),
  doctorId: z.string().min(1, 'Choose a doctor'),
  visitType: z.string().min(1, 'Choose the visit type'),
  /** "cash" or a panel id */
  payerId: z.string().min(1),
  category: z.string().min(1),
  appointmentId: z.string().optional(),
  panelApprovalNo: z.string().trim().optional(),
  panelDocuments: z.array(z.string()).optional(),
  /** Internal referral: no new consultation fee. */
  referredFromVisitId: z.string().optional(),
  waiveConsultation: z.boolean().optional(),
})
export type CheckInInput = z.infer<typeof checkInInputSchema>

/** Doctor-to-doctor referral, same episode: a new free visit for the other doctor (OPD workbench). */
export const referralInputSchema = z.object({
  toDoctorId: z.string().min(1, 'Choose a doctor'),
  note: z.string().trim().max(200).optional(),
})
export type ReferralInput = z.infer<typeof referralInputSchema>

export interface Visit {
  id: string
  clinicId: string
  visitNo: string
  patientId: string
  doctorId: string
  departmentId: string
  date: string
  visitType: string
  payerId: string
  category: string
  tokenNo: number
  /** Token as shown and called: "7", or "E2" for casualty. */
  token: string
  priority: boolean
  /** Casualty visit (OPD-14): own E-token queue, may be seen before paying. */
  emergency?: boolean
  /** Medico-legal case: cannot be cancelled or marked no-show. */
  mlc?: MlcInfo
  /** Position in the doctor's queue (skip moves a token back). */
  queueOrder: number
  status: VisitStatus
  consultPaid: boolean
  appointmentId?: string
  panelApprovalNo?: string
  panelDocuments?: string[]
  referredFromVisitId?: string
  waiveConsultation?: boolean
  checkedInAt: IsoDateTime
  calledAt?: IsoDateTime
  completedAt?: IsoDateTime
  cancelReason?: string
  history: { at: IsoDateTime; by: string; action: string }[]
}

export interface MlcInfo {
  policeStation: string
  mlcNo: string
  officerName?: string
  recordedAt: IsoDateTime
  recordedBy: string
}

/** A visit with names, for lists. */
export interface VisitRow extends Visit {
  patient: PatientBrief
  doctorName: string
  departmentName: string
  room?: string
  visitTypeLabel: string
  payerName: string
  hasVitals: boolean
  pendingCharges: number
  waitingMinutes: number
}

/** What check-in suggests for a patient + doctor (OPD-05 free follow-up detection). */
export interface VisitSuggestion {
  visitType: string
  reason: string
  lastVisit?: { date: string; doctorName: string; visitType: string }
}

/* ---------- Vitals ---------- */

const num = (min: number, max: number, label: string) => z.number({ error: `Enter ${label}` }).min(min, `${label} looks wrong`).max(max, `${label} looks wrong`).optional()

export const vitalsInputSchema = z
  .object({
    bpSys: num(50, 260, 'systolic BP'),
    bpDia: num(30, 160, 'diastolic BP'),
    pulse: num(20, 250, 'pulse'),
    tempF: num(90, 110, 'temperature'),
    spo2: num(50, 100, 'SpO₂'),
    rr: num(5, 60, 'respiratory rate'),
    weightKg: num(0.5, 300, 'weight'),
    heightCm: num(30, 250, 'height'),
    painScore: num(0, 10, 'pain score'),
    sugar: num(20, 700, 'blood sugar'),
    notes: z.string().trim().optional(),
  })
  .refine((v) => v.bpSys === undefined || v.bpDia === undefined || v.bpSys > v.bpDia, { path: ['bpDia'], message: 'Diastolic must be lower than systolic' })
  .refine((v) => Object.entries(v).some(([k, x]) => k !== 'notes' && x !== undefined), { path: ['bpSys'], message: 'Enter at least one reading' })
export type VitalsInput = z.infer<typeof vitalsInputSchema>

export interface Vitals extends VitalsInput {
  id: string
  clinicId: string
  visitId: string
  bmi?: number
  recordedBy: string
  recordedByName: string
  recordedAt: IsoDateTime
}

/* ---------- Clinical note, prescription, orders ---------- */

export interface Diagnosis {
  code: string
  name: string
  type: 'provisional' | 'final'
}

export interface RxItem {
  drugId: string
  brand: string
  generic: string
  strength: string
  form: string
  dose: string
  frequency: string
  route: string
  timing: string
  duration: number
  durationUnit: 'D' | 'W' | 'M'
  qty?: number
  instructions?: string
}

export interface NoteContent {
  complaints: string[]
  complaintText: string
  hpi: string
  pastHistory: string
  familyHistory: string
  personalHistory: string
  examination: string
  diagnoses: Diagnosis[]
  advice: string
  followUpDate: string | null
  rx: RxItem[]
}

export const EMPTY_NOTE: NoteContent = {
  complaints: [],
  complaintText: '',
  hpi: '',
  pastHistory: '',
  familyHistory: '',
  personalHistory: '',
  examination: '',
  diagnoses: [],
  advice: '',
  followUpDate: null,
  rx: [],
}

export interface ClinicalNote extends NoteContent {
  id: string
  clinicId: string
  visitId: string
  patientId: string
  doctorId: string
  lockedAt?: IsoDateTime
  addenda: { text: string; at: IsoDateTime; by: string; byName: string }[]
  updatedAt: IsoDateTime
}

export type OrderStatus = 'ordered' | 'billed' | 'cancelled'

export interface Order {
  id: string
  clinicId: string
  visitId: string
  patientId: string
  serviceId: string
  serviceName: string
  group: string
  status: OrderStatus
  orderedBy: string
  orderedAt: IsoDateTime
  billId?: string
}

export interface RxTemplate {
  id: string
  clinicId: string
  name: string
  /** null = shared with all doctors */
  doctorId: string | null
  complaints: string[]
  diagnoses: Diagnosis[]
  rx: RxItem[]
  advice: string
}

export interface OrderSet {
  id: string
  name: string
  serviceIds: string[]
}

/* ---------- Billing ---------- */

export interface BillLine {
  id: string
  serviceId: string
  code: string
  name: string
  group: string
  qty: number
  ratePaise: Paise
  amountPaise: Paise
  /** Part of the line the panel pays (0 for cash patients). */
  panelPaise: Paise
  patientPaise: Paise
  orderId?: string
  priceNote: string
}

export type BillStatus = 'unpaid' | 'paid' | 'cancelled'

export interface DiscountRequest {
  percent: number
  amountPaise: Paise
  reason: string
  status: 'auto' | 'pending' | 'approved' | 'rejected'
  requestedBy: string
  requestedByName: string
  decidedBy?: string
  decidedByName?: string
  decidedAt?: IsoDateTime
}

export interface Bill {
  id: string
  clinicId: string
  billNo: string
  visitId: string
  patientId: string
  payerId: string
  lines: BillLine[]
  grossPaise: Paise
  panelPaise: Paise
  /** Patient share before discount. */
  patientGrossPaise: Paise
  discount: DiscountRequest | null
  /** What the patient must pay = patientGross − approved discount. */
  patientNetPaise: Paise
  paidPaise: Paise
  status: BillStatus
  cancelReason?: string
  cancelledBy?: string
  cancelledAt?: IsoDateTime
  createdBy: string
  createdByName: string
  createdAt: IsoDateTime
}

export interface PaymentLine {
  mode: string
  amountPaise: Paise
  reference?: string
}

export interface Receipt {
  id: string
  clinicId: string
  receiptNo: string
  billId: string
  lines: PaymentLine[]
  totalPaise: Paise
  /** Negative receipt = refund on bill cancellation. */
  kind: 'payment' | 'refund'
  receivedBy: string
  receivedByName: string
  at: IsoDateTime
}

export interface BillDraftLine {
  serviceId: string
  qty: number
  /** Only for open-price services. */
  ratePaise?: number
  orderId?: string
}

export const paymentInputSchema = z
  .object({
    lines: z
      .array(
        z.object({
          mode: z.string().min(1),
          amountPaise: z.number().int().positive('Enter an amount'),
          reference: z.string().trim().optional(),
        }),
      )
      .min(1),
  })
export type PaymentInput = z.infer<typeof paymentInputSchema>

/** Everything the bill and receipt print needs. */
export interface BillView extends Bill {
  patient: PatientBrief
  visit: Pick<Visit, 'visitNo' | 'tokenNo' | 'token' | 'date' | 'visitType' | 'mlc'> & { doctorName: string; visitTypeLabel: string }
  payerName: string
  receipts: Receipt[]
}

/* ---------- ICD-10 ---------- */

export interface Icd10 {
  code: string
  name: string
}

/* ---------- Emergency (OPD-14) ---------- */

export const emergencyInputSchema = z
  .object({
    /** Name if known; blank = "Unknown male/female". */
    name: z.string().trim().optional(),
    gender: z.enum(GENDERS, { error: 'Choose gender' }),
    approxAge: z.number({ error: 'Enter approximate age' }).int().min(0, 'Age looks wrong').max(120, 'Age looks wrong'),
    /** Attendant's mobile, if any. */
    mobile: z.union([z.literal(''), mobileSchema]).optional(),
    broughtBy: z.string().trim().optional(),
    complaint: z.string().trim().optional(),
    doctorId: z.string().min(1, 'Choose the duty doctor'),
    isMlc: z.boolean(),
    policeStation: z.string().trim().optional(),
    mlcNo: z.string().trim().optional(),
    officerName: z.string().trim().optional(),
  })
  .refine((v) => !v.isMlc || !!v.policeStation, { path: ['policeStation'], message: 'Enter the police station' })
  .refine((v) => !v.isMlc || !!v.mlcNo, { path: ['mlcNo'], message: 'Enter the MLC number' })
export type EmergencyInput = z.infer<typeof emergencyInputSchema>
