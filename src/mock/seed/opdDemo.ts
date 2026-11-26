/**
 * A realistic OPD day for Sunrise Hospital, generated relative to "now":
 * ~45 patients with history, today's appointments, and today's visits in every
 * state (completed, in consultation, vitals done, billed, waiting to pay), plus a
 * discount waiting for approval and test orders waiting to be billed.
 * Deterministic (seeded random), so demos and tests are repeatable.
 */
import dayjs from 'dayjs'
import { addDays, toIST, todayIST } from '@/lib/dates'
import { splitLines } from '@/lib/opd/billSplit'
import { sessionsOn, slotTimes } from '@/lib/opd/slots'
import { bmi } from '@/lib/opd/vitals'
import { lookupPrice } from '@/lib/pricing'
import type { Appointment, Bill, ClinicalNote, NoteContent, Order, Patient, Receipt, Visit, Vitals } from '@/types/opd'
import { EMPTY_NOTE } from '@/types/opd'
import type { DbShape } from '../db'
import { nextBillNo, nextReceiptNo, nextTempUhid, nextToken, nextUhid, nextVisitNo } from '../numbers'
import { ICD10 } from './icd10'
import { consultationServiceId } from './masters'

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

// name, gender, age, category, allergies, chronic
type P = [string, 'M' | 'F', number, string?, string[]?, string[]?]
const PEOPLE: P[] = [
  ['Ramesh Kulkarni', 'M', 58, 'general', [], ['Hypertension']],
  ['Sunita Deshpande', 'F', 52, 'general', ['PEN'], ['Type 2 diabetes']],
  ['Aarav Joshi', 'M', 6],
  ['Ananya Patil', 'F', 4],
  ['Vijay Shinde', 'M', 45, 'general', [], ['Type 2 diabetes']],
  ['Meena Shinde', 'F', 41],
  ['Prakash Jadhav', 'M', 67, 'senior', [], ['Hypertension', 'Type 2 diabetes']],
  ['Kavita Pawar', 'F', 34],
  ['Rohit Bhosale', 'M', 29],
  ['Neha Kale', 'F', 26],
  ['Suresh Naik', 'M', 71, 'senior', ['NSAID'], ['COPD']],
  ['Pooja More', 'F', 31],
  ['Ishaan More', 'M', 3],
  ['Ganesh Gaikwad', 'M', 38, 'staff'],
  ['Asha Salunkhe', 'F', 63, 'senior', [], ['Hypothyroidism']],
  ['Nitin Deshmukh', 'M', 49],
  ['Swati Kadam', 'F', 37],
  ['Arjun Kadam', 'M', 9],
  ['Rajendra Wagh', 'M', 55, 'general', [], ['Hypertension']],
  ['Lata Chavan', 'F', 68, 'senior'],
  ['Mahesh Pawar', 'M', 42],
  ['Shraddha Kulkarni', 'F', 24],
  ['Omkar Thorat', 'M', 19],
  ['Rekha Sawant', 'F', 46, 'general', ['SULFA']],
  ['Anil Mane', 'M', 61, 'senior', [], ['Type 2 diabetes']],
  ['Priyanka Raut', 'F', 28],
  ['Siddharth Raut', 'M', 1],
  ['Deepak Lokhande', 'M', 35, 'staff'],
  ['Manisha Jagtap', 'F', 39],
  ['Yash Jagtap', 'M', 12],
  ['Sanjay Ingle', 'M', 53],
  ['Vandana Ingle', 'F', 50],
  ['Tanvi Gokhale', 'F', 17],
  ['Harshad Apte', 'M', 33],
  ['Kiran Nikam', 'F', 44],
  ['Bhushan Dhage', 'M', 27],
  ['Sneha Bhagat', 'F', 30, 'general', ['PEN']],
  ['Riya Bhagat', 'F', 5],
  ['Dattatray Sathe', 'M', 74, 'senior', [], ['Hypertension', 'Osteoarthritis of knee']],
  ['Shobha Phadke', 'F', 59],
  ['Akash Waghmare', 'M', 23],
  ['Farida Shaikh', 'F', 36],
  ['Imran Shaikh', 'M', 40],
  ['John D’Souza', 'M', 47],
  ['Lakshmi Iyer', 'F', 65, 'senior', [], ['Hypothyroidism']],
]

const FIRST_M = ['Aditya', 'Amol', 'Ajay', 'Atul', 'Abhijit', 'Chetan', 'Dinesh', 'Gaurav', 'Hemant', 'Jayant', 'Kunal', 'Mangesh', 'Milind', 'Nikhil', 'Pankaj', 'Prasad', 'Rahul', 'Rakesh', 'Sachin', 'Sagar', 'Santosh', 'Shailesh', 'Sunil', 'Swapnil', 'Tushar', 'Umesh', 'Vaibhav', 'Vinod', 'Yogesh', 'Zaheer', 'Arnav', 'Vihaan', 'Reyansh', 'Kabir', 'Ayaan']
const FIRST_F = ['Aarti', 'Anjali', 'Ashwini', 'Bhagyashree', 'Deepali', 'Gauri', 'Jyoti', 'Kalyani', 'Ketaki', 'Madhuri', 'Manasi', 'Mrunal', 'Neeta', 'Pallavi', 'Pradnya', 'Rupali', 'Sayali', 'Seema', 'Shital', 'Smita', 'Sonali', 'Sujata', 'Supriya', 'Trupti', 'Ujwala', 'Vaishali', 'Varsha', 'Yogita', 'Zoya', 'Anaya', 'Myra', 'Saanvi', 'Ira', 'Kiara']
const BULK_SURNAMES = ['Mhatre', 'Bapat', 'Karve', 'Ranade', 'Dixit', 'Tambe', 'Ghule', 'Borse', 'Dhumal', 'Kokate', 'Lande', 'Mohite', 'Nalawade', 'Pingle', 'Rane', 'Sonawane', 'Tupe', 'Yadav', 'Zende', 'Bansode', 'Chaudhari', 'Darekar', 'Ekbote', 'Hande', 'Inamdar', 'Khot', 'Londhe', 'Mulay', 'Pathare', 'Sable', 'Shelar', 'Tidke', 'Vaidya', 'Bhide', 'Godbole', 'Limaye', 'Oak', 'Paranjpe', 'Wagle', 'Kamble']

const ADDRESS = ['Kothrud', 'Karve Nagar', 'Warje', 'Erandwane', 'Deccan', 'Bavdhan', 'Paud Road', 'Sinhagad Road']

/** Which doctors a patient would see. */
function doctorsFor(age: number, gender: 'M' | 'F'): string[] {
  if (age < 14) return ['doc-meera', 'doc-kavya']
  const out = ['doc-vikram', 'doc-vikram', 'doc-rajesh', 'doc-harish', 'doc-sunil', 'doc-pooja']
  if (gender === 'F' && age < 55) out.push('doc-farah', 'doc-farah')
  return out
}

/** Diagnosis + prescription per doctor for past visits (from templates or simple notes). */
function contentFor(db: DbShape, clinicId: string, doctorId: string, p: Patient, r: () => number): NoteContent {
  const tpl = (key: string) => db.rxTemplates.find((t) => t.id === `rxt-${clinicId}-${key}`)!
  const fromTpl = (key: string): NoteContent => {
    const t = tpl(key)
    return { ...structuredClone(EMPTY_NOTE), complaints: t.complaints, diagnoses: t.diagnoses.map((d) => ({ ...d, type: 'final' })), rx: t.rx, advice: t.advice, examination: 'General condition fair. Chest clear. Abdomen soft.' }
  }
  if (p.chronicConditions.includes('Hypertension') && doctorId === 'doc-vikram') return fromTpl('htn')
  if (p.chronicConditions.includes('Type 2 diabetes') && doctorId === 'doc-vikram') return fromTpl('dm')
  if (doctorId === 'doc-meera' || doctorId === 'doc-kavya') return fromTpl('urti-child')
  const simple = (complaint: string, code: string, name: string, advice: string): NoteContent => ({
    ...structuredClone(EMPTY_NOTE),
    complaints: [complaint],
    diagnoses: [{ code, name, type: 'final' }],
    examination: 'Vitals stable.',
    advice,
  })
  switch (doctorId) {
    case 'doc-harish':
      return simple('Sore throat', 'J03.9', 'Acute tonsillitis, unspecified', 'Warm saline gargles.')
    case 'doc-sunil':
      return simple('Back pain', 'M54.5', 'Low back pain', 'Back exercises; avoid lifting heavy weights.')
    case 'doc-farah':
      return simple('Abdominal pain', 'N94.6', 'Dysmenorrhoea, unspecified', 'Review with USG report.')
    case 'doc-pooja':
      return simple('Skin rash', 'L30.9', 'Dermatitis, unspecified', 'Avoid soap on the affected area.')
    default:
      return fromTpl(r() < 0.5 ? 'fever' : 'rhinitis')
  }
}

export function seedOpdDemo(db: DbShape, clinicId: string, now: Date) {
  const r = rng(20261122)
  const today = todayIST(now)
  const ist = toIST(now)
  const nowHHMM = ist.format('HH:mm')
  const staff = { admin: 'user-admin', cashier: 'user-cashier', nurse: 'user-nurse', fo: 'user-frontoffice' }
  const userName = (id: string) => db.users.find((u) => u.id === id)?.name ?? ''
  const cons = consultationServiceId(clinicId)
  const svc = (code: string) => db.services.find((s) => s.clinicId === clinicId && s.code === code)!
  const doctorOf = (id: string) => db.doctors.find((d) => d.id === id)!

  /* ---------- Patients ---------- */
  let lastMobile = ''
  const patients: Patient[] = PEOPLE.map(([name, gender, age, category = 'general', allergies = [], chronic = []], i) => {
    const sharesFamilyMobile = i > 0 && ['Meena Shinde', 'Ishaan More', 'Arjun Kadam', 'Siddharth Raut', 'Yash Jagtap', 'Vandana Ingle', 'Riya Bhagat', 'Imran Shaikh'].includes(name)
    const mobile = sharesFamilyMobile ? lastMobile : `9${String(Math.floor(r() * 9e8) + 1e8).slice(0, 9)}`
    lastMobile = mobile
    const exactDob = r() < 0.7
    const dob = exactDob
      ? dayjs(today).subtract(age, 'year').subtract(Math.floor(r() * 300), 'day').format('YYYY-MM-DD')
      : `${Number(today.slice(0, 4)) - age}-01-01`
    const created = dayjs(today).subtract(Math.floor(r() * 400) + 30, 'day').toISOString()
    const p: Patient = {
      id: `pt-${String(i + 1).padStart(3, '0')}`,
      clinicId,
      uhid: nextUhid(db, clinicId, created.slice(0, 10)),
      salutation: age < 14 ? (gender === 'M' ? 'MASTER' : 'BABY') : gender === 'M' ? 'MR' : 'MRS',
      name,
      gender,
      dob,
      dobApprox: !exactDob,
      mobile,
      email: '',
      addressLine: `${Math.floor(r() * 200) + 1}, ${ADDRESS[i % ADDRESS.length]}`,
      city: 'Pune',
      pinCode: '411038',
      bloodGroup: ['APOS', 'BPOS', 'OPOS', 'ABPOS', null][i % 5] ?? null,
      idProofType: age >= 18 ? 'AADHAAR' : null,
      idProofNo: age >= 18 ? `XXXX XXXX ${String(1000 + i * 37).slice(-4)}` : '',
      abhaNumber: i % 6 === 0 ? `91-${String(1000 + i).slice(-4)}-${String(5000 + i * 13).slice(-4)}-${String(7000 + i * 7).slice(-4)}` : '',
      guardianName: age < 18 ? PEOPLE[i - 1]?.[0] ?? '' : '',
      guardianRelation: age < 18 ? (PEOPLE[i - 1]?.[1] === 'F' ? 'MOTHER' : 'FATHER') : null,
      referralSource: ['SELF', 'DOCTOR', 'FRIEND', 'ONLINE'][i % 4] ?? 'SELF',
      category,
      allergies: allergies.map((code) => db.valueListItems.find((v) => v.clinicId === clinicId && v.type === 'allergy' && v.code === code)?.label ?? code),
      chronicConditions: chronic,
      createdAt: created,
      updatedAt: created,
    }
    return p
  })
  db.patients.push(...patients)

  /* ---------- Helpers that mirror the API (no request context in the seed) ---------- */
  const makeVisit = (p: Patient, doctorId: string, date: string, at: string, o: Partial<Visit> = {}): Visit => {
    const d = doctorOf(doctorId)
    const token = nextToken(db, clinicId, doctorId, date)
    return {
      id: `vis-${date}-${doctorId}-${token}`,
      clinicId,
      visitNo: nextVisitNo(db, clinicId, date),
      patientId: p.id,
      doctorId,
      departmentId: d.departmentId,
      date,
      visitType: 'new',
      payerId: 'cash',
      category: p.category,
      tokenNo: token,
      token: String(token),
      priority: false,
      queueOrder: token,
      status: 'checkedIn',
      consultPaid: false,
      checkedInAt: at,
      history: [{ at, by: userName(staff.fo), action: `Checked in, token ${token}` }],
      ...o,
    }
  }

  const bill = (v: Visit, serviceIds: string[], at: string, pay: boolean, o: { discountPercent?: number; pendingBy?: string; mode?: string; cashier?: string; reason?: string; approvedBy?: string; lean?: boolean } = {}): Bill => {
    const panel = v.payerId !== 'cash' ? db.panels.find((x) => x.id === v.payerId) ?? null : null
    const tariffs = db.tariffs.filter((t) => t.clinicId === clinicId)
    const priced = serviceIds.map((sid) => {
      const s = db.services.find((x) => x.id === sid)!
      const pr = lookupPrice({ serviceId: sid, doctorId: v.doctorId, visitType: v.visitType, payerId: v.payerId, patientCategory: v.category, date: v.date }, s, tariffs, panel)
      return { s, pr }
    })
    const split = splitLines(priced.map((x) => ({ amountPaise: x.pr.amountPaise, group: x.s.group })), panel)
    const lines = priced.map((x, i) => ({
      id: `${v.id}-l${i}`,
      serviceId: x.s.id,
      code: x.s.code,
      name: x.s.id === cons ? `Consultation – ${doctorOf(v.doctorId).name} (${db.valueListItems.find((vl) => vl.clinicId === clinicId && vl.type === 'visitType' && vl.code === v.visitType)?.label})` : x.s.name,
      group: x.s.group,
      qty: 1,
      ratePaise: x.pr.amountPaise,
      amountPaise: x.pr.amountPaise,
      panelPaise: split[i]!.panelPaise,
      patientPaise: split[i]!.patientPaise,
      priceNote: o.lean ? '' : x.pr.explanation,
    }))
    const gross = lines.reduce((s, l) => s + l.amountPaise, 0)
    const panelPaise = lines.reduce((s, l) => s + l.panelPaise, 0)
    const patientGross = gross - panelPaise
    const pct = o.discountPercent ?? 0
    const discountPaise = Math.round((patientGross * pct) / 100)
    const pending = !!o.pendingBy
    const b: Bill = {
      id: `bill-${v.id}-${db.bills.length}`,
      clinicId,
      billNo: nextBillNo(db, clinicId, v.date),
      visitId: v.id,
      patientId: v.patientId,
      payerId: v.payerId,
      lines,
      grossPaise: gross,
      panelPaise,
      patientGrossPaise: patientGross,
      discount: pct
        ? {
            percent: pct,
            amountPaise: discountPaise,
            reason: o.reason ?? (pending ? 'HARDSHIP' : 'SENIOR'),
            status: pending ? 'pending' : o.approvedBy ? 'approved' : 'auto',
            requestedBy: o.pendingBy ?? o.cashier ?? staff.cashier,
            requestedByName: userName(o.pendingBy ?? o.cashier ?? staff.cashier),
            ...(o.approvedBy ? { decidedBy: o.approvedBy, decidedByName: userName(o.approvedBy), decidedAt: at } : {}),
          }
        : null,
      patientNetPaise: pending ? patientGross : patientGross - discountPaise,
      paidPaise: 0,
      status: 'unpaid',
      createdBy: o.cashier ?? staff.cashier,
      createdByName: userName(o.cashier ?? staff.cashier),
      createdAt: at,
    }
    db.bills.push(b)
    if (pay || b.patientNetPaise === 0) {
      if (b.patientNetPaise > 0) {
        const mode = o.mode ?? (r() < 0.55 ? 'upi' : 'cash')
        const rc: Receipt = {
          id: `rcp-${b.id}`,
          clinicId,
          receiptNo: nextReceiptNo(db, clinicId, v.date),
          billId: b.id,
          lines: [{ mode, amountPaise: b.patientNetPaise, reference: mode === 'upi' ? `UTR${Math.floor(r() * 1e12)}` : mode === 'card' ? `APP${Math.floor(r() * 1e6)}` : undefined }],
          totalPaise: b.patientNetPaise,
          kind: 'payment',
          receivedBy: o.cashier ?? staff.cashier,
          receivedByName: userName(o.cashier ?? staff.cashier),
          at,
        }
        db.receipts.push(rc)
        b.paidPaise = b.patientNetPaise
      }
      b.status = 'paid'
      if (serviceIds.includes(cons)) v.consultPaid = true
    }
    return b
  }

  const vitalsFor = (v: Visit, p: Patient, at: string): Vitals => {
    const age = dayjs(today).diff(dayjs(p.dob), 'year')
    const child = age < 14
    const weight = child ? 8 + age * 2.5 : Math.round(50 + r() * 35)
    const height = child ? 70 + age * 6 : Math.round(150 + r() * 30)
    const hyper = p.chronicConditions.includes('Hypertension')
    const fever = r() < 0.3
    const vt: Vitals = {
      id: `vt-${v.id}`,
      clinicId,
      visitId: v.id,
      bpSys: child ? undefined : hyper ? 142 + Math.round(r() * 20) : 112 + Math.round(r() * 18),
      bpDia: child ? undefined : hyper ? 90 + Math.round(r() * 8) : 72 + Math.round(r() * 12),
      pulse: 70 + Math.round(r() * 25),
      tempF: Math.round((fever ? 100.4 + r() * 1.5 : 98 + r() * 0.8) * 10) / 10,
      spo2: 96 + Math.round(r() * 3),
      rr: 14 + Math.round(r() * 6),
      weightKg: weight,
      heightCm: height,
      bmi: bmi(weight, height),
      sugar: p.chronicConditions.includes('Type 2 diabetes') ? 150 + Math.round(r() * 80) : undefined,
      recordedBy: staff.nurse,
      recordedByName: userName(staff.nurse),
      recordedAt: at,
    }
    db.vitals.push(vt)
    return vt
  }

  const note = (v: Visit, p: Patient, at: string, locked: boolean, content?: NoteContent): ClinicalNote => {
    const n: ClinicalNote = { ...(content ?? contentFor(db, clinicId, v.doctorId, p, r)), id: `note-${v.id}`, clinicId, visitId: v.id, patientId: p.id, doctorId: v.doctorId, addenda: [], updatedAt: at, lockedAt: locked ? at : undefined }
    db.notes.push(n)
    return n
  }

  const order = (v: Visit, code: string, at: string, billId?: string): Order => {
    const s = svc(code)
    const o: Order = { id: `ord-${v.id}-${code}`, clinicId, visitId: v.id, patientId: v.patientId, serviceId: s.id, serviceName: s.name, group: s.group, status: billId ? 'billed' : 'ordered', orderedBy: doctorOf(v.doctorId).userId ?? 'user-doctor', orderedAt: at, billId }
    db.orders.push(o)
    return o
  }

  /* ---------- Past 90 days: the named patients' history plus a busy OPD for reports ---------- */
  const named = (n: string) => patients.find((p) => p.name === n)!
  type Plan = { p: Patient; doctorId: string; date: string; at: dayjs.Dayjs; bulk: boolean; fromAppointment?: boolean }
  const plans: Plan[] = []
  const morning = (date: string) => dayjs(`${date}T04:30:00Z`).add(Math.floor(r() * 180), 'minute')
  // Demo anchors: free follow-up today (4 days ago) and paid follow-up (15 days ago) with Dr. Vikram.
  for (const [p, doctorId, daysAgo] of [
    [named('Ramesh Kulkarni'), 'doc-vikram', 4],
    [named('Sunita Deshpande'), 'doc-vikram', 15],
    [named('Sunita Deshpande'), 'doc-vikram', 70],
    [named('Prakash Jadhav'), 'doc-vikram', 40],
  ] as [Patient, string, number][]) {
    const date = addDays(today, -daysAgo)
    plans.push({ p, doctorId, date, at: morning(date), bulk: false })
  }
  const anchored = new Set(plans.map((x) => x.p.id))
  for (const p of patients) {
    if (anchored.has(p.id) || r() < 0.35) continue
    const n = 1 + Math.floor(r() * 3)
    const age = dayjs(today).diff(dayjs(p.dob), 'year')
    const docs = doctorsFor(age, p.gender as 'M' | 'F')
    for (let k = 0; k < n; k++) {
      const date = addDays(today, -(9 + Math.floor(r() * 80)))
      plans.push({ p, doctorId: docs[Math.floor(r() * docs.length)]!, date, at: morning(date), bulk: false })
    }
  }

  // Everyday OPD volume per session, a gentle upward trend and a weekly pattern (busy Monday, quiet Sunday).
  const VOLUME: Record<string, number> = { 'doc-vikram': 2.6, 'doc-meera': 2, 'doc-sunil': 1.3, 'doc-farah': 1.4, 'doc-rajesh': 1.3, 'doc-pooja': 1.2, 'doc-harish': 1.3, 'doc-kavya': 1.2, 'doc-arjun': 1 }
  const WEEKDAY = [0.5, 1.3, 1.1, 1.0, 1.0, 1.05, 1.15]
  const pool = new Map<string, { p: Patient; last: string }[]>()
  const usedSurnames = new Set(PEOPLE.map(([n]) => n.split(' ').slice(-1)[0]))
  const SURNAMES = BULK_SURNAMES.filter((x) => !usedSurnames.has(x))
  let bulkNo = 0
  const newBulkPatient = (doctorId: string, at: string): Patient => {
    const child = doctorId === 'doc-meera' || doctorId === 'doc-kavya'
    const gender: 'M' | 'F' = doctorId === 'doc-farah' ? 'F' : r() < 0.5 ? 'M' : 'F'
    const age = child ? Math.floor(r() * 13) : doctorId === 'doc-farah' ? 20 + Math.floor(r() * 30) : 18 + Math.floor(r() * 62)
    const first = (gender === 'M' ? FIRST_M : FIRST_F)[Math.floor(r() * (gender === 'M' ? FIRST_M.length : FIRST_F.length))]!
    const p: Patient = {
      id: `pth-${String(++bulkNo).padStart(4, '0')}`,
      clinicId,
      uhid: nextUhid(db, clinicId, at.slice(0, 10)),
      name: `${first} ${SURNAMES[Math.floor(r() * SURNAMES.length)]}`,
      gender,
      dob: addDays(today, -(age * 365 + Math.floor(r() * 300))),
      dobApprox: true,
      mobile: `9${String(Math.floor(r() * 1e9)).padStart(9, '0')}`,
      category: age >= 60 ? 'senior' : 'general',
      allergies: [],
      chronicConditions: [],
      city: 'Pune',
      createdAt: at,
      updatedAt: at,
    }
    patients.push(p)
    db.patients.push(p)
    return p
  }
  for (let d = 90; d >= 1; d--) {
    const date = addDays(today, -d)
    const wd = dayjs(date).day()
    const trend = 0.85 + 0.3 * ((90 - d) / 90)
    for (const [doctorId, base] of Object.entries(VOLUME)) {
      for (const s of sessionsOn(db.schedules, doctorId, date)) {
        const n = Math.round(base * WEEKDAY[wd]! * trend * (0.6 + 0.8 * r()))
        const casualty = doctorId === 'doc-arjun'
        const [h, m] = (casualty ? `${8 + Math.floor(r() * 12)}:00` : s.start).split(':').map(Number)
        for (let i = 0; i < n; i++) {
          // About a third are follow-ups of this doctor's patients from the last month.
          const mine = (pool.get(doctorId) ?? []).filter((x) => dayjs(date).diff(dayjs(x.last), 'day') <= 30 && x.last < date)
          const followUp = !casualty && mine.length > 0 && r() < 0.45
          const minute = casualty ? Math.floor(r() * 50) : Math.floor((i / Math.max(1, n)) * 150 + r() * 30)
          const at = dayjs.tz(`${date} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'Asia/Kolkata').add(minute, 'minute')
          const p = followUp ? mine[Math.floor(r() * mine.length)]!.p : newBulkPatient(doctorId, at.toISOString())
          const entry = (pool.get(doctorId) ?? []).find((x) => x.p.id === p.id)
          if (entry) entry.last = date
          else pool.set(doctorId, [...(pool.get(doctorId) ?? []), { p, last: date }])
          plans.push({ p, doctorId, date, at, bulk: true, fromAppointment: !casualty && r() < 0.35 })
        }
      }
    }
  }
  plans.sort((a, b) => a.at.valueOf() - b.at.valueOf())

  const DX: Record<string, [string, number][]> = {
    'doc-vikram': [['I10', 14], ['E11.9', 12], ['J06.9', 10], ['B34.9', 8], ['R50.9', 7], ['A09', 6], ['K29.7', 6], ['A90', 4], ['N39.0', 5], ['E78.5', 4], ['D50.9', 4], ['K30', 4], ['J20.9', 4], ['E03.9', 3], ['G43.9', 3], ['M79.1', 3]],
    'doc-rajesh': [['J06.9', 12], ['R50.9', 9], ['K29.7', 7], ['I10', 6], ['E11.9', 5], ['B34.9', 6], ['A09', 5], ['R51', 4], ['Z00.0', 3]],
    'doc-meera': [['J06.9', 25], ['J00', 12], ['A09', 10], ['R50.9', 10], ['J03.9', 8], ['Z00.1', 8], ['Z23', 8], ['H66.9', 6], ['J45.9', 5], ['L20.9', 5], ['B01.9', 3]],
    'doc-sunil': [['M54.5', 20], ['M17.9', 15], ['M25.5', 10], ['M54.2', 10], ['M54.4', 8], ['M79.1', 8], ['S93.4', 8], ['M75.0', 6], ['M81.9', 5], ['S52.5', 4]],
    'doc-farah': [['Z34.9', 25], ['N94.6', 12], ['N92.6', 10], ['E28.2', 10], ['N76.0', 8], ['D50.9', 8], ['N95.1', 6], ['O21.0', 5], ['O24.4', 4]],
    'doc-pooja': [['L70.0', 20], ['B35.4', 15], ['L30.9', 12], ['L50.9', 10], ['B86', 8], ['L20.9', 8], ['B35.6', 7], ['L40.9', 6], ['L80', 4]],
    'doc-harish': [['J03.9', 18], ['J01.9', 12], ['H66.9', 12], ['J30.4', 12], ['H61.2', 10], ['H60.9', 8], ['J32.9', 7], ['H81.1', 6]],
    'doc-arjun': [['S93.4', 10], ['T14.1', 10], ['S01.9', 8], ['R10.4', 8], ['A09', 8], ['W54', 6], ['R07.4', 6], ['E86.0', 5], ['S52.5', 4]],
  }
  DX['doc-kavya'] = DX['doc-meera']!
  const TESTS: Record<string, [number, string[]]> = {
    'doc-vikram': [0.3, ['CBC', 'FBS', 'HBA1C', 'LIPID', 'LFT', 'KFT', 'TSH', 'URINE-R', 'ECG', 'DENGUE', 'XR-CHEST']],
    'doc-rajesh': [0.2, ['CBC', 'URINE-R', 'FBS']],
    'doc-meera': [0.12, ['CBC', 'URINE-R', 'NEB']],
    'doc-kavya': [0.12, ['CBC', 'NEB']],
    'doc-sunil': [0.3, ['INJ', 'POP', 'DRESS-S']],
    'doc-farah': [0.35, ['USG-ABD', 'CBC', 'URINE-R', 'TSH']],
    'doc-pooja': [0.05, ['CBC']],
    'doc-harish': [0.1, ['CBC', 'NEB']],
    'doc-arjun': [0.65, ['DRESS-S', 'SUTURE', 'INJ', 'ECG', 'XR-CHEST', 'DRESS-L']],
  }
  const icdName = (code: string) => ICD10.find((x) => x.code === code)?.name
  const pickDx = (doctorId: string) => {
    const list = DX[doctorId] ?? DX['doc-vikram']!
    let n = r() * list.reduce((t, [, w]) => t + w, 0)
    for (const [code, w] of list) if ((n -= w) <= 0) return code
    return list[0]![0]
  }
  const WAIT: Record<string, number> = { 'doc-vikram': 28, 'doc-meera': 22, 'doc-arjun': 6 }
  const cashierAt = (at: dayjs.Dayjs) => (at.tz('Asia/Kolkata').hour() >= 16 ? 'user-cashier2' : staff.cashier)

  for (const pl of plans) {
    const { p, doctorId, date, at } = pl
    if (!sessionsOn(db.schedules, doctorId, date).length) continue
    const earlier = db.visits.filter((x) => x.patientId === p.id && x.doctorId === doctorId && x.date < date).sort((a, b) => b.date.localeCompare(a.date))[0]
    const gap = earlier ? dayjs(date).diff(dayjs(earlier.date), 'day') : 999
    const visitType = gap <= 7 ? 'freeFollowUp' : gap <= 30 ? 'followUp' : 'new'
    const hour = at.tz('Asia/Kolkata').hour()
    const peak = hour >= 10 && hour < 12 ? 1.5 : 1
    const wait = Math.max(2, Math.round((WAIT[doctorId] ?? 14) * peak * (0.4 + 1.2 * r())))
    const casualty = doctorId === 'doc-arjun'
    const roll = r()
    const outcome = !pl.bulk ? 'seen' : roll < 0.02 ? 'noShow' : roll < 0.03 ? 'cancelled' : 'seen'
    const panel = pl.bulk && !casualty && p.category !== 'senior' && dayjs(today).diff(dayjs(p.dob), 'year') >= 21 && r() < 0.07 ? 'panel-tata' : 'cash'
    const v = makeVisit(p, doctorId, date, at.toISOString(), {
      visitType,
      payerId: panel,
      status: outcome === 'seen' ? 'completed' : outcome,
      calledAt: outcome === 'seen' ? at.add(wait, 'minute').toISOString() : undefined,
      completedAt: outcome === 'seen' ? at.add(wait + 6 + Math.floor(r() * 10), 'minute').toISOString() : undefined,
      emergency: casualty || undefined,
      priority: casualty || !!pl.fromAppointment,
    })
    if (casualty) v.token = `E${v.tokenNo}`
    if (panel === 'panel-tata') v.panelDocuments = ['Employee ID card']
    if (pl.bulk) v.history = [{ at: v.checkedInAt, by: 'Front office', action: `Checked in, token ${v.token}` }]
    if (outcome === 'cancelled') v.cancelReason = 'Patient left'
    db.visits.push(v)
    if (pl.fromAppointment) {
      const booked = at.subtract(1 + Math.floor(r() * 4), 'day').toISOString()
      db.appointments.push({ id: `apt-h-${v.id}`, clinicId, patientId: p.id, doctorId, date, slot: at.tz('Asia/Kolkata').format('HH:mm'), status: outcome === 'seen' ? 'arrived' : 'noShow', source: r() < 0.6 ? 'phone' : 'counter', visitId: outcome === 'seen' ? v.id : undefined, history: [{ at: booked, by: 'Front office', action: 'Booked' }], createdAt: booked })
      v.appointmentId = outcome === 'seen' ? `apt-h-${v.id}` : undefined
    }
    if (outcome !== 'seen') continue
    const cashier = cashierAt(at)
    const senior = p.category === 'senior' && r() < 0.6
    const courtesy = !senior && pl.bulk && r() < 0.025
    const mode = r() < 0.45 ? 'cash' : r() < 0.85 ? 'upi' : 'card'
    const consBill = bill(v, [cons], at.add(3, 'minute').toISOString(), true, {
      cashier,
      mode,
      lean: pl.bulk,
      ...(senior ? { discountPercent: 10, reason: 'SENIOR' } : courtesy ? { discountPercent: 20 + 10 * Math.floor(r() * 3), reason: r() < 0.5 ? 'COURTESY' : 'HARDSHIP', approvedBy: r() < 0.5 ? 'user-admin' : 'user-md' } : {}),
    })
    // About one bill in a hundred is cancelled the same day (refunded in cash).
    if (pl.bulk && r() < 0.012 && consBill.paidPaise > 0) {
      const refundAt = at.add(25, 'minute').toISOString()
      consBill.status = 'cancelled'
      consBill.cancelReason = ['WRONGPT', 'WRONGSVC', 'DUP', 'DRNA'][Math.floor(r() * 4)]
      consBill.cancelledBy = userName('user-admin')
      consBill.cancelledAt = refundAt
      db.receipts.push({ id: `rcp-ref-${consBill.id}`, clinicId, receiptNo: nextReceiptNo(db, clinicId, date), billId: consBill.id, lines: [{ mode: 'cash', amountPaise: -consBill.paidPaise, reference: 'Refund' }], totalPaise: -consBill.paidPaise, kind: 'refund', receivedBy: cashier, receivedByName: userName(cashier), at: refundAt })
    }
    if (!pl.bulk || dayjs(today).diff(dayjs(date), 'day') <= 14) vitalsFor(v, p, at.add(Math.max(1, wait - 3), 'minute').toISOString())
    const completed = v.completedAt!
    if (pl.bulk) {
      const code = pickDx(doctorId)
      const name = icdName(code) ?? code
      db.notes.push({ ...structuredClone(EMPTY_NOTE), diagnoses: [{ code, name, type: 'final' }], id: `note-${v.id}`, clinicId, visitId: v.id, patientId: p.id, doctorId, addenda: [], updatedAt: completed, lockedAt: completed })
    } else {
      const n = note(v, p, completed, true)
      n.followUpDate = addDays(date, 7)
    }
    const [chance, codes] = TESTS[doctorId] ?? [0, []]
    if (r() < chance) {
      const picked = [...new Set([codes[Math.floor(r() * codes.length)]!, ...(r() < 0.4 ? [codes[Math.floor(r() * codes.length)]!] : [])])]
      const tAt = at.add(wait + 18, 'minute').toISOString()
      const b2 = bill(v, picked.map((c) => svc(c).id), tAt, true, { cashier, mode: r() < 0.5 ? 'cash' : 'upi', lean: pl.bulk })
      for (const c of picked) order(v, c, completed, b2.id)
    }
  }

  /* ---------- Today ---------- */
  const minsAgo = (m: number) => ist.subtract(m, 'minute').utc().toISOString()
  const todays: { name: string; doctorId: string; state: 'completedOrders' | 'completed' | 'inConsultation' | 'vitalsDone' | 'billed' | 'waitingToPay' | 'discountPending' | 'appointment' | 'panelBilled' | 'cghs'; ago: number; payerId?: string; visitType?: string }[] = [
    { name: 'Rohit Bhosale', doctorId: 'doc-vikram', state: 'completed', ago: 170 },
    { name: 'Kavita Pawar', doctorId: 'doc-vikram', state: 'completedOrders', ago: 160 },
    { name: 'Nitin Deshmukh', doctorId: 'doc-vikram', state: 'completed', ago: 140 },
    { name: 'Rajendra Wagh', doctorId: 'doc-vikram', state: 'inConsultation', ago: 120 },
    { name: 'Mahesh Pawar', doctorId: 'doc-vikram', state: 'vitalsDone', ago: 95, payerId: 'panel-tata' },
    { name: 'Swati Kadam', doctorId: 'doc-vikram', state: 'billed', ago: 70 },
    { name: 'Anil Mane', doctorId: 'doc-vikram', state: 'discountPending', ago: 50 },
    { name: 'Harshad Apte', doctorId: 'doc-vikram', state: 'waitingToPay', ago: 15 },
    { name: 'Aarav Joshi', doctorId: 'doc-meera', state: 'completed', ago: 150 },
    { name: 'Riya Bhagat', doctorId: 'doc-meera', state: 'inConsultation', ago: 110 },
    { name: 'Arjun Kadam', doctorId: 'doc-meera', state: 'vitalsDone', ago: 80 },
    { name: 'Siddharth Raut', doctorId: 'doc-meera', state: 'waitingToPay', ago: 20 },
    { name: 'Suresh Naik', doctorId: 'doc-harish', state: 'cghs', ago: 100, payerId: 'panel-cghs' },
    { name: 'Neha Kale', doctorId: 'doc-harish', state: 'billed', ago: 60 },
    { name: 'Akash Waghmare', doctorId: 'doc-harish', state: 'waitingToPay', ago: 10 },
  ]
  for (const t of todays) {
    const p = named(t.name)
    if (!sessionsOn(db.schedules, t.doctorId, today).length) continue
    const v = makeVisit(p, t.doctorId, today, minsAgo(t.ago), { payerId: t.payerId ?? 'cash', visitType: t.visitType ?? 'new' })
    if (t.payerId === 'panel-tata') v.panelDocuments = ['Employee ID card']
    if (t.payerId === 'panel-cghs') v.panelDocuments = ['CGHS card', 'Referral letter']
    db.visits.push(v)
    const step = (m: number) => minsAgo(Math.max(1, t.ago - m))
    switch (t.state) {
      case 'completed':
      case 'completedOrders': {
        bill(v, [cons], step(4), true)
        vitalsFor(v, p, step(10))
        v.calledAt = step(20)
        v.completedAt = step(32)
        v.status = 'completed'
        note(v, p, step(32), true)
        if (t.state === 'completedOrders') {
          // Doctor ordered tests: waiting at the billing counter as pending charges.
          order(v, 'CBC', step(30))
          order(v, 'DENGUE', step(30))
          db.notes.find((n) => n.visitId === v.id)!.diagnoses = [{ code: 'R50.9', name: 'Fever, unspecified', type: 'provisional' }]
        }
        break
      }
      case 'inConsultation':
        bill(v, [cons], step(4), true)
        vitalsFor(v, p, step(10))
        v.calledAt = minsAgo(6)
        v.status = 'inConsultation'
        note(v, p, minsAgo(2), false, { ...structuredClone(EMPTY_NOTE), complaints: ['Headache'], complaintText: 'Headache for 3 days, worse in the morning.' })
        break
      case 'vitalsDone':
      case 'cghs':
        bill(v, [cons], step(4), true)
        vitalsFor(v, p, step(12))
        v.status = 'vitalsDone'
        break
      case 'billed':
        bill(v, [cons], step(4), true)
        v.status = 'billed'
        break
      case 'discountPending':
        bill(v, [cons], step(3), false, { discountPercent: 30, pendingBy: staff.cashier })
        break
      case 'waitingToPay':
      case 'appointment':
      case 'panelBilled':
        break
    }
  }

  /* ---------- Casualty (OPD-14): a known patient seen earlier, an unknown MLC case with the doctor, one waiting ---------- */
  const emergency = (p: Patient, ago: number, o: Partial<Visit> = {}) => {
    const v = makeVisit(p, 'doc-arjun', today, minsAgo(ago), { priority: true, emergency: true, ...o })
    v.token = `E${v.tokenNo}`
    v.history = [{ at: v.checkedInAt, by: userName(staff.fo), action: `Emergency registration, token ${v.token}` }]
    db.visits.push(v)
    return v
  }
  const unknown = (gender: 'M' | 'F', age: number, broughtBy: string, ago: number): Patient => {
    const at = minsAgo(ago)
    const p: Patient = {
      id: `pt-tmp-${gender}${age}`,
      clinicId,
      uhid: nextTempUhid(db, clinicId, today),
      temporary: true,
      name: `Unknown ${gender === 'M' ? 'male' : 'female'}`,
      gender,
      dob: addDays(today, -Math.round(age * 365.25)),
      dobApprox: true,
      mobile: '',
      category: 'general',
      allergies: [],
      chronicConditions: [],
      guardianName: broughtBy,
      createdAt: at,
      updatedAt: at,
    }
    db.patients.push(p)
    return p
  }
  if (sessionsOn(db.schedules, 'doc-arjun', today).length) {
    const dogBite = emergency(named('Omkar Thorat'), 200, { status: 'completed', calledAt: minsAgo(195), completedAt: minsAgo(180) })
    bill(dogBite, [cons], minsAgo(178), true)
    note(dogBite, named('Omkar Thorat'), minsAgo(180), true, { ...structuredClone(EMPTY_NOTE), complaints: ['Dog bite'], examination: 'Category II bite, left calf. Wound washed.', diagnoses: [{ code: 'W54', name: 'Bitten or struck by dog', type: 'final' }], advice: 'Complete the anti-rabies vaccine course: day 3, 7 and 28. Keep the wound clean.' })
    const rta = unknown('M', 40, '108 ambulance (road accident, Hinjewadi flyover)', 35)
    const rtaVisit = emergency(rta, 35, {
      status: 'inConsultation',
      calledAt: minsAgo(30),
      mlc: { policeStation: 'Hinjewadi Police Station', mlcNo: `MLC/${today.slice(0, 4)}/0417`, officerName: 'HC S. Pawar (buckle 2231)', recordedAt: minsAgo(34), recordedBy: userName(staff.fo) },
    })
    vitalsFor(rtaVisit, rta, minsAgo(32))
    unknown('F', 70, 'Neighbour (fall at home)', 8)
    emergency(db.patients[db.patients.length - 1]!, 8)
  }

  /* ---------- Appointments: today's remaining slots (or tomorrow's) ---------- */
  const book = (p: Patient, doctorId: string, date: string, slot: string, status: Appointment['status'] = 'booked') => {
    const at = minsAgo(60 * 24 + Math.floor(r() * 600))
    db.appointments.push({
      id: `apt-${date}-${doctorId}-${slot}`,
      clinicId,
      patientId: p.id,
      doctorId,
      date,
      slot,
      status,
      source: r() < 0.6 ? 'phone' : 'counter',
      history: [{ at, by: userName(staff.fo), action: `Booked for ${date} ${slot}` }],
      createdAt: at,
    })
  }
  const futureSlots = (doctorId: string, date: string) =>
    sessionsOn(db.schedules, doctorId, date)
      .flatMap((s) => slotTimes(s))
      .filter((t) => date > today || t > nowHHMM)
  for (const [doctorId, names] of [
    ['doc-vikram', ['Sunita Deshpande', 'Ramesh Kulkarni', 'Prakash Jadhav', 'Sanjay Ingle']],
    ['doc-meera', ['Ishaan More', 'Yash Jagtap']],
    ['doc-harish', ['Kiran Nikam']],
  ] as [string, string[]][]) {
    let date = today
    let slots = futureSlots(doctorId, date)
    if (slots.length < names.length * 2) {
      date = addDays(today, 1)
      slots = futureSlots(doctorId, date)
    }
    names.forEach((n, i) => {
      const slot = slots[i * 2]
      if (slot) book(named(n), doctorId, date, slot)
    })
  }
}
