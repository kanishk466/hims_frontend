/**
 * In-memory mock database, persisted to localStorage.
 *
 * ONLY src/api/* may import this file (enforced by the lint rule in .oxlintrc.json).
 * When the shape changes, bump DB_VERSION: old saved data is discarded and reseeded.
 */
import type { AuditEntry, Role, User } from '@/types/auth'
import type { Clinic } from '@/types/clinic'
import type { Department, Doctor, DoctorSchedule, Drug, Leave, Panel, Service, Tariff } from '@/types/masters'
import type { Appointment, Bill, ClinicalNote, Order, Patient, Receipt, RxTemplate, Visit, Vitals } from '@/types/opd'
import type { ValueListItem } from '@/types/valueLists'
import type { CashClosing, DayClose } from '@/types/dayEnd'
import type { Credential } from './password'
import { buildSeed } from './seed'

export const DB_VERSION = 6
export const DB_STORAGE_KEY = `hms-mock-db-v${DB_VERSION}`

export interface MockSession {
  token: string
  userId: string
  createdAt: string
}

export interface NumberSeries {
  clinicId: string
  /** "uhid" | "visit" | "token" | "bill" | "receipt" (token is per doctor per day in step 5) */
  key: string
  prefix: string
  next: number
  /** When the counter goes back to 1. */
  reset: 'never' | 'daily' | 'financialYear'
  /** Day or financial year the counter currently belongs to ("2026-11-22", "2026-27"). */
  period?: string
}

export interface DbShape {
  version: number
  seededAt: string
  clinics: Clinic[]
  roles: Role[]
  users: User[]
  departments: Department[]
  doctors: Doctor[]
  schedules: DoctorSchedule[]
  leaves: Leave[]
  services: Service[]
  tariffs: Tariff[]
  panels: Panel[]
  drugs: Drug[]
  valueListItems: ValueListItem[]
  patients: Patient[]
  appointments: Appointment[]
  visits: Visit[]
  vitals: Vitals[]
  notes: ClinicalNote[]
  orders: Order[]
  bills: Bill[]
  receipts: Receipt[]
  cashClosings: CashClosing[]
  dayCloses: DayClose[]
  rxTemplates: RxTemplate[]
  sessions: MockSession[]
  /** Password hashes and lockout state, kept apart from users so they are never sent to screens. */
  credentials: Credential[]
  numberSeries: NumberSeries[]
  auditLog: AuditEntry[]
}

let state: DbShape | null = null

// Tests reseed before almost every case; building 90 days of history each time is slow, so the
// test run builds it once and copies it.
let testSeed: string | null = null

function seed(): DbShape {
  if (import.meta.env.MODE === 'test') {
    testSeed ??= JSON.stringify({ ...buildSeed(), version: DB_VERSION })
    return JSON.parse(testSeed) as DbShape
  }
  return { ...buildSeed(), version: DB_VERSION }
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function dropOldVersions() {
  const st = storage()
  if (!st) return
  for (let i = st.length - 1; i >= 0; i--) {
    const key = st.key(i)
    if (key?.startsWith('hms-mock-db-v') && key !== DB_STORAGE_KEY) st.removeItem(key)
  }
}

function load(): DbShape {
  dropOldVersions()
  const raw = storage()?.getItem(DB_STORAGE_KEY)
  lastSaved = raw ?? ''
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DbShape
      if (parsed.version === DB_VERSION) return parsed
    } catch {
      // corrupted: fall through and reseed
    }
  }
  const fresh = seed()
  persist(fresh)
  return fresh
}

let lastSaved = ''

/**
 * Save to localStorage, but only when something changed: every request commits, and an
 * unchanged write would still wake every other tab (storage event) for nothing.
 */
function persist(db: DbShape) {
  const json = JSON.stringify(db)
  if (json === lastSaved) return
  try {
    storage()?.setItem(DB_STORAGE_KEY, json)
    lastSaved = json
  } catch (e) {
    console.warn('Mock DB could not be saved to localStorage', e)
  }
}

/** The live database. Callers in src/api must clone before returning data to screens. */
export function db(): DbShape {
  if (!state) state = load()
  return state
}

/** Save after any change. */
export function commit() {
  if (state) persist(state)
}

/** Wipe everything and reseed the demo data. */
export function resetDb(): DbShape {
  state = seed()
  persist(state)
  return state
}

/**
 * Several demo tabs (front desk, doctor, TV display) share one browser: when another
 * tab saves, drop our copy so the next read sees its changes. The app also refreshes
 * its queries on this event (src/app/crossTabSync.ts).
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_STORAGE_KEY) state = null
  })
}

/** For tests: drop the in-memory copy so the next db() call reloads from storage. */
export function _unloadDb() {
  state = null
}
