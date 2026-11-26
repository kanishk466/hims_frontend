/** OPD reports (OPD Spec → "OPD reports") and the MD dashboard. One shape renders every report. */
export const REPORT_KEYS = ['footfall', 'collection', 'doctorRevenue', 'appointments', 'waitingTime', 'discounts', 'diagnoses'] as const
export type ReportKey = (typeof REPORT_KEYS)[number]

export interface ReportInfo {
  key: ReportKey
  title: string
  description: string
  /** Who the spec says uses it, and how often. */
  audience: string
}

export const REPORTS: ReportInfo[] = [
  { key: 'footfall', title: 'Daily footfall', description: 'Patients by doctor and department, new vs follow-up.', audience: 'MD, admin · daily' },
  { key: 'collection', title: 'Collection by mode and cashier', description: 'Cash, UPI, card and refunds for each cashier.', audience: 'Accounts · daily' },
  { key: 'doctorRevenue', title: 'Doctor-wise revenue', description: 'Patients seen, consultation and test revenue per doctor.', audience: 'MD, doctors · monthly' },
  { key: 'appointments', title: 'No-shows and cancellations', description: 'Appointment no-show and cancellation rates by doctor.', audience: 'Front office manager · weekly' },
  { key: 'waitingTime', title: 'Waiting time', description: 'Check-in to consultation, by doctor and hour of the day.', audience: 'Admin, quality · weekly' },
  { key: 'discounts', title: 'Discounts and cancelled bills', description: 'Every discount and cancelled bill, with who asked and who approved.', audience: 'MD, audit · monthly' },
  { key: 'diagnoses', title: 'Top diagnoses', description: 'Most frequent ICD-10 diagnoses.', audience: 'Medical director · monthly' },
]

export interface ReportQuery {
  from: string
  to: string
  doctorId?: string | null
  departmentId?: string | null
}

export type ValueFormat = 'int' | 'inr' | 'pct' | 'min' | 'text' | 'date'

export interface ReportTile {
  label: string
  value: number
  format: ValueFormat
  hint?: string
}

export interface ReportChart {
  kind: 'bar' | 'stacked' | 'line'
  /** Category axis field in each data row. */
  dataKey: string
  series: { name: string; label: string; color: string }[]
  data: Record<string, string | number>[]
  format: ValueFormat
}

export interface ReportColumn {
  key: string
  label: string
  format: ValueFormat
}

export type ReportRow = Record<string, string | number | null>

export interface ReportResult {
  key: ReportKey
  title: string
  query: ReportQuery
  tiles: ReportTile[]
  chart?: ReportChart
  chartTitle?: string
  columns: ReportColumn[]
  rows: ReportRow[]
  totals?: ReportRow
  note?: string
  generatedAt: string
  clinicName: string
}

export interface MdDashboard {
  today: {
    patients: number
    newPatients: number
    followUps: number
    emergencies: number
    waitingNow: number
    inConsultationNow: number
    collectedPaise: number
    panelDuesPaise: number
    discountsPaise: number
    avgWaitMinutes: number | null
    noShows: number
  }
  doctors: { doctorId: string; name: string; department: string; waiting: number; inRoom: number; done: number; avgWait: number | null }[]
  trend: { date: string; patients: number; revenue: number }[]
  /** Last 30 days vs the 30 before. */
  change: { patientsPct: number | null; revenuePct: number | null; patients30: number; revenue30Paise: number }
  payerMix: { payer: string; visits: number; grossPaise: number }[]
  topDiagnoses: { code: string; name: string; count: number }[]
}
