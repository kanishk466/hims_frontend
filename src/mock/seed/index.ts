import { DEMO_PASSWORD, hashPassword } from '../password'
import type { User } from '@/types/auth'
import { addDays, todayIST } from '@/lib/dates'
import type { Department, Doctor, DoctorSchedule, Panel, Tariff } from '@/types/masters'
import { COMMON_DEPARTMENTS } from '@/types/masters'
import { syncConsultationTariffs } from '../consultationTariffs'
import type { DbShape } from '../db'
import { provisionClinic, roleId } from '../provision'
import { consultationServiceId } from './masters'
import { seedDayEnds } from './dayEnds'
import { seedOpdDemo } from './opdDemo'

/** Stable ids so links, tests and bookmarks survive a "Reset demo data". */
export const SEED_IDS = {
  clinic: 'clinic-sunrise',
  lotus: 'clinic-lotus',
  users: {
    superAdmin: 'user-superadmin',
    admin: 'user-admin',
    frontOffice: 'user-frontoffice',
    cashier: 'user-cashier',
    nurse: 'user-nurse',
    doctor: 'user-doctor',
    accounts: 'user-accounts',
    md: 'user-md',
  },
  lotusAdmin: 'user-lotus-admin',
  role: (key: string) => roleId('sunrise', key),
} as const

const rupees = (r: number) => r * 100

export function buildSeed(now = new Date()): DbShape {
  const at = now.toISOString()
  const db: DbShape = {
    version: 0,
    seededAt: at,
    clinics: [],
    roles: [],
    users: [],
    departments: [],
    doctors: [],
    schedules: [],
    leaves: [],
    services: [],
    tariffs: [],
    panels: [],
    drugs: [],
    valueListItems: [],
    patients: [],
    appointments: [],
    visits: [],
    vitals: [],
    notes: [],
    orders: [],
    bills: [],
    receipts: [],
    rxTemplates: [],
    cashClosings: [],
    dayCloses: [],
    sessions: [],
    credentials: [],
    numberSeries: [],
    auditLog: [],
  }

  /* ---------- Platform super-admin ---------- */
  db.users.push({
    id: SEED_IDS.users.superAdmin,
    clinicId: null,
    name: 'Rohan Mehta',
    username: 'rohan.mehta',
    mobile: '9820012345',
    email: 'rohan.mehta@yourhms.in',
    designation: 'Platform Super Admin',
    isSuperAdmin: true,
    roleIds: [],
    status: 'active',
    persona: 'superAdmin',
    createdAt: at,
  })

  /* ---------- Sunrise Hospital, Pune: fully set up ---------- */
  const { clinic: sunrise, admin } = provisionClinic(
    db,
    {
      name: 'Sunrise Hospital',
      code: 'sunrise',
      city: 'Pune',
      state: 'Maharashtra',
      plan: 'pro',
      beds: 75,
      adminName: 'Sanjay Kulkarni',
      adminMobile: '9850023456',
      adminEmail: 'sanjay.k@sunrisehospital.in',
    },
    { now, clinicId: SEED_IDS.clinic, adminUserId: SEED_IDS.users.admin, adminActive: true },
  )
  Object.assign(sunrise, {
    uhidPrefix: 'SUN',
    legalName: 'Sunrise Multispeciality Hospital Pvt. Ltd.',
    addressLine: 'Plot 14, Karve Road, Kothrud',
    pinCode: '411038',
    phone: '020 2546 7788',
    email: 'opd@sunrisehospital.in',
    registrationNo: 'PMC/HOSP/2016/0457',
    gstin: '27AAKCS4821M1Z5',
    pan: 'AAKCS4821M',
    hfrId: 'IN2710000457',
    nabhStatus: 'entry',
    website: 'www.sunrisehospital.in',
    status: 'active',
    setupCompletedAt: at,
  })
  db.numberSeries.filter((s) => s.clinicId === sunrise.id && s.key === 'uhid').forEach((s) => (s.prefix = 'SUN'))
  admin.persona = 'admin'
  admin.designation = 'Hospital Administrator'

  const deptCodes = ['GM', 'PAED', 'ORTH', 'OBGY', 'DERM', 'ENT']
  const depts: Department[] = deptCodes.map((code, i) => {
    const t = COMMON_DEPARTMENTS.find((d) => d.code === code)!
    return { id: `dept-sunrise-${code.toLowerCase()}`, clinicId: sunrise.id, code, name: t.name, type: t.type, queueColor: t.queueColor, sortOrder: i + 1, active: true, createdAt: at, updatedAt: at }
  })
  db.departments.push(...depts)
  // Casualty runs round the clock with a duty doctor (OPD-14 emergency registration).
  db.departments.push({ id: 'dept-sunrise-cas', clinicId: sunrise.id, code: 'CAS', name: 'Casualty', type: 'clinical', queueColor: 'red', casualty: true, sortOrder: depts.length + 1, active: true, createdAt: at, updatedAt: at })
  const dept = (code: string) => `dept-sunrise-${code.toLowerCase()}`

  const MMC = 'Maharashtra Medical Council'
  const doctorRows: [string, string, string, string, string, number, number, Doctor['type'], string][] = [
    ['doc-vikram', 'Dr. Vikram Rao', 'GM', 'MBBS, MD (Medicine)', 'MMC 2009/04/1187', 500, 300, 'fullTime', '9881067890'],
    ['doc-meera', 'Dr. Meera Iyer', 'PAED', 'MBBS, MD (Paediatrics)', 'MMC 2011/07/2290', 600, 400, 'fullTime', '9822078901'],
    ['doc-sunil', 'Dr. Sunil Bhosale', 'ORTH', 'MBBS, MS (Orthopaedics)', 'MMC 2006/02/0915', 700, 400, 'fullTime', '9822089012'],
    ['doc-farah', 'Dr. Farah Shaikh', 'OBGY', 'MBBS, MS (OBGY)', 'MMC 2012/09/3321', 700, 400, 'fullTime', '9823090123'],
    ['doc-rajesh', 'Dr. Rajesh Nair', 'GM', 'MBBS, DNB (Family Medicine)', 'MMC 2015/01/4410', 400, 250, 'visiting', '9890101234'],
    ['doc-pooja', 'Dr. Pooja Agarwal', 'DERM', 'MBBS, MD (DVL)', 'MMC 2014/06/3876', 600, 400, 'visiting', '9890112345'],
    ['doc-harish', 'Dr. Harish Menon', 'ENT', 'MBBS, MS (ENT)', 'MMC 2010/11/2045', 500, 300, 'fullTime', '9890123456'],
    ['doc-kavya', 'Dr. Kavya Reddy', 'PAED', 'MBBS, DCH', 'MMC 2017/03/5102', 500, 300, 'visiting', '9890134567'],
    ['doc-arjun', 'Dr. Arjun Kale', 'CAS', 'MBBS, Dip. Emergency Medicine', 'MMC 2016/08/4821', 400, 400, 'fullTime', '9890145678'],
  ]
  doctorRows.forEach(([id, name, d, qualification, registrationNo, feeNew, feeFollow, type, mobile], i) =>
    db.doctors.push({
      id,
      clinicId: sunrise.id,
      name,
      departmentId: dept(d),
      qualification,
      council: MMC,
      registrationNo,
      feeNewPaise: rupees(feeNew),
      feeFollowUpPaise: rupees(feeFollow),
      type,
      mobile,
      sortOrder: i + 1,
      active: true,
      createdAt: at,
      updatedAt: at,
    }),
  )

  const MON_SAT = [1, 2, 3, 4, 5, 6]
  const sched = (doctorId: string, n: number, weekdays: number[], start: string, end: string, slotMinutes: number, room: string, maxPatients?: number, walkInQuota?: number): DoctorSchedule => ({
    id: `sch-${doctorId}-${n}`,
    clinicId: sunrise.id,
    doctorId,
    weekdays,
    start,
    end,
    slotMinutes,
    maxPatients,
    walkInQuota,
    room,
    active: true,
    createdAt: at,
    updatedAt: at,
  })
  db.schedules.push(
    // Vikram, Meera and Harish also run a Sunday OPD (keeps the demo alive any day of the week).
    sched('doc-vikram', 1, [0, ...MON_SAT], '09:30', '13:30', 10, 'OPD 1', 30, 6),
    sched('doc-vikram', 2, [1, 2, 3, 4, 5], '17:30', '20:00', 10, 'OPD 1', 15, 4),
    sched('doc-meera', 1, [0, ...MON_SAT], '10:00', '14:00', 10, 'OPD 2', 28, 6),
    sched('doc-sunil', 1, [1, 3, 5], '10:00', '13:00', 15, 'OPD 3', 12, 2),
    sched('doc-sunil', 2, [2, 4, 6], '16:00', '19:00', 15, 'OPD 3', 12, 2),
    sched('doc-farah', 1, MON_SAT, '11:00', '15:00', 15, 'OPD 4', 16, 4),
    sched('doc-rajesh', 1, [2, 4, 6], '17:00', '20:00', 10, 'OPD 5', 18, 6),
    sched('doc-pooja', 1, [1, 4], '15:00', '18:00', 15, 'OPD 6', 12, 2),
    sched('doc-harish', 1, [0, ...MON_SAT], '09:00', '12:00', 10, 'OPD 7', 18, 4),
    sched('doc-kavya', 1, [3, 6], '16:00', '19:00', 10, 'OPD 2', 18, 4),
    // Duty doctor in casualty: all day, every day; walk-in only.
    sched('doc-arjun', 1, [0, ...MON_SAT], '00:00', '23:59', 15, 'Casualty'),
  )

  const staff = (id: string, persona: User['persona'], name: string, username: string, mobile: string, designation: string, roleKeys: string[], doctorId?: string): User => ({
    id,
    clinicId: sunrise.id,
    name,
    username,
    mobile,
    email: `${username}@sunrisehospital.in`,
    designation,
    isSuperAdmin: false,
    roleIds: roleKeys.map(SEED_IDS.role),
    doctorId,
    status: 'active',
    persona,
    // Spread demo last-login times over the past day.
    lastLoginAt: new Date(now.getTime() - ((id.length * 37) % 20 + 1) * 3_600_000).toISOString(),
    createdAt: at,
  })
  db.users.push(
    staff(SEED_IDS.users.frontOffice, 'frontOffice', 'Priya Patil', 'priya.patil', '9767034567', 'Front Office Executive', ['frontOffice']),
    staff(SEED_IDS.users.cashier, 'cashier', 'Amit Joshi', 'amit.joshi', '9890045678', 'OPD Cashier', ['cashier']),
    staff(SEED_IDS.users.nurse, 'nurse', 'Sneha Gaikwad', 'sneha.gaikwad', '9623056789', 'Staff Nurse, OPD', ['nurse']),
    staff(SEED_IDS.users.doctor, 'doctor', 'Dr. Vikram Rao', 'vikram.rao', '9881067890', 'Consultant Physician', ['doctor'], 'doc-vikram'),
    staff('user-doc-meera', undefined, 'Dr. Meera Iyer', 'meera.iyer', '9822078901', 'Consultant Paediatrician', ['doctor'], 'doc-meera'),
    staff('user-cashier2', undefined, 'Rahul Kamble', 'rahul.kamble', '9890056780', 'OPD Cashier (evening)', ['cashier']),
    staff('user-accounts', 'accounts', 'Kavita Shah', 'kavita.shah', '9763045612', 'Accounts Executive', ['accounts']),
    staff('user-md', 'md', 'Dr. Arvind Deshmukh', 'arvind.deshmukh', '9822011223', 'Medical Director', ['md']),
  )
  for (const u of db.users) if (u.doctorId) db.doctors.find((d) => d.id === u.doctorId)!.userId = u.id

  seedSunriseBilling(db, sunrise.id, now)
  seedOpdDemo(db, sunrise.id, now)
  seedDayEnds(db, sunrise.id, now)

  /* ---------- Lotus Care Clinic, Nashik: blank, for trying the setup wizard ---------- */
  provisionClinic(
    db,
    {
      name: 'Lotus Care Clinic',
      code: 'lotus',
      city: 'Nashik',
      state: 'Maharashtra',
      plan: 'trial',
      beds: 20,
      adminName: 'Rahul Pawar',
      adminMobile: '9850098765',
      adminEmail: 'rahul.pawar@lotuscare.in',
    },
    { now, clinicId: SEED_IDS.lotus, adminUserId: SEED_IDS.lotusAdmin, adminActive: true },
  )

  // Every active demo user signs in with the same password.
  for (const u of db.users.filter((x) => x.status === 'active'))
    db.credentials.push({ userId: u.id, passwordHash: hashPassword(u.id, DEMO_PASSWORD), failedAttempts: 0, passwordChangedAt: at })

  return db
}

/** Sunrise only: consultation rate history, panels with their rates, a pending rate and leave. */
function seedSunriseBilling(db: DbShape, clinicId: string, now: Date) {
  const today = todayIST(now)
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  const fyStart = `${m >= 4 ? y : y - 1}-04-01` // Indian financial year starts 1 April
  const lastFy = `${Number(fyStart.slice(0, 4)) - 1}-04-01`
  const admin = SEED_IDS.users.admin

  // Consultation fees: last year's rates (₹100 lower) then this financial year's.
  for (const d of db.doctors.filter((x) => x.clinicId === clinicId)) {
    syncConsultationTariffs(db, { ...d, feeNewPaise: d.feeNewPaise - 10000, feeFollowUpPaise: d.feeFollowUpPaise - 5000 }, admin, lastFy, now)
    syncConsultationTariffs(db, d, admin, fyStart, now)
  }

  const contract = (o: Partial<Panel['contract']>): Panel['contract'] => ({
    validFrom: fyStart,
    validTo: addDays(`${Number(fyStart.slice(0, 4)) + 1}-04-01`, -1),
    rateBasis: 'panelTariff',
    adjustPercent: 0,
    creditLimitPaise: 50000000,
    creditDays: 30,
    billingCycle: 'monthly',
    ...o,
  })
  const coverage = (o: Partial<Panel['coverage']>): Panel['coverage'] => ({ copayPercent: 0, copayFixedPaise: 0, excludedGroups: [], perVisitCapPaise: 0, ...o })
  const panel = (id: string, code: string, name: string, type: Panel['type'], extra: Partial<Panel>): Panel => ({
    id,
    clinicId,
    code,
    name,
    type,
    parentId: null,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    gstin: '',
    contract: contract({}),
    coverage: coverage({}),
    requirements: { documents: [], priorApproval: false, approvalValidityDays: 0 },
    active: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...extra,
  })
  db.panels.push(
    panel('panel-tata', 'TATAMOT', 'Tata Motors Ltd. (Pimpri plant)', 'corporate', {
      contactPerson: 'Mr. Nitin Bhave, HR Welfare',
      phone: '020 6613 2000',
      email: 'welfare.pimpri@example.in',
      address: 'Pimpri, Pune 411018',
      contract: contract({ creditLimitPaise: 100000000, creditDays: 45 }),
      coverage: coverage({ copayPercent: 10, excludedGroups: ['package'] }),
      requirements: { documents: ['Employee ID card'], priorApproval: false, approvalValidityDays: 0 },
    }),
    panel('panel-cghs', 'CGHS', 'CGHS Pune', 'government', {
      address: 'CGHS Wellness Centre, Pune',
      contract: contract({ creditDays: 60 }),
      coverage: coverage({ excludedGroups: ['misc', 'package'] }),
      requirements: { documents: ['CGHS card', 'Referral letter'], priorApproval: false, approvalValidityDays: 0 },
    }),
    panel('panel-star', 'STAR', 'Star Health Insurance', 'insurer', { contract: contract({ rateBasis: 'hospitalTariff', adjustPercent: 0 }) }),
    panel('panel-mediassist', 'MEDIASSIST', 'Medi Assist TPA', 'tpa', {
      parentId: 'panel-star',
      contactPerson: 'Desk: Ms. Shruti Kale',
      phone: '1800 425 9449',
      contract: contract({ rateBasis: 'hospitalTariff', adjustPercent: -10, creditDays: 30 }),
      coverage: coverage({ copayPercent: 20, perVisitCapPaise: 200000 }),
      requirements: { documents: ['Insurance / TPA card', 'Aadhaar'], priorApproval: true, approvalValidityDays: 30 },
    }),
  )

  const svc = (code: string) => `svc-${clinicId}-${code.toLowerCase()}`
  const rate = (id: string, serviceId: string, amount: number, o: Partial<Tariff> = {}): Tariff => ({
    id,
    clinicId,
    serviceId,
    doctorId: null,
    visitType: null,
    payerId: null,
    patientCategory: null,
    amountPaise: amount * 100,
    validFrom: fyStart,
    status: 'approved',
    createdBy: admin,
    createdAt: now.toISOString(),
    approvedBy: admin,
    approvedAt: now.toISOString(),
    ...o,
  })
  const cons = consultationServiceId(clinicId)
  db.tariffs.push(
    // Panel consultation rates (CGHS rates are fixed by the scheme).
    rate('tar-cghs-cons-new', cons, 350, { payerId: 'panel-cghs', visitType: 'new' }),
    rate('tar-cghs-cons-fu', cons, 350, { payerId: 'panel-cghs', visitType: 'followUp' }),
    rate('tar-cghs-cbc', svc('CBC'), 135, { payerId: 'panel-cghs' }),
    rate('tar-cghs-ecg', svc('ECG'), 50, { payerId: 'panel-cghs' }),
    rate('tar-tata-cons', cons, 450, { payerId: 'panel-tata' }),
    // Free follow-up within validity, and senior citizen rate for CBC.
    rate('tar-free-fu', cons, 0, { visitType: 'freeFollowUp' }),
    rate('tar-cbc-senior', svc('CBC'), 300, { patientCategory: 'senior' }),
    // A price rise starting in 10 days, and a rate waiting for Accounts to approve.
    rate('tar-ecg-next', svc('ECG'), 350, { validFrom: addDays(today, 10), note: 'Revised rate card' }),
    rate('tar-usg-pending', svc('USG-ABD'), 1400, { validFrom: addDays(today, 1), status: 'pending', createdBy: 'user-cashier', approvedBy: undefined, approvedAt: undefined, note: 'New machine' }),
  )

  db.leaves.push(
    { id: 'leave-farah', clinicId, doctorId: 'doc-farah', from: addDays(today, 3), to: addDays(today, 5), reason: 'FOGSI conference, Mumbai', active: true, createdAt: now.toISOString() },
    { id: 'leave-holiday', clinicId, doctorId: null, from: addDays(today, 18), to: addDays(today, 18), reason: 'Hospital holiday', active: true, createdAt: now.toISOString() },
  )
}
