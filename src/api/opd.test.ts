import { describe, expect, it } from 'vitest'
import { addDays, todayIST } from '@/lib/dates'
import { loginAs } from '@/test/utils'
import type { PatientInput } from '@/types/opd'
import { bookAppointment, cancelAppointment, getDaySlots } from './appointments'
import { cancelBill, createBill, decideDiscount, getBillingContext, listBills, takePayment } from './billing'
import { ApiError } from './client'
import { completeConsultation, getConsultation, orderServices, saveNote } from './emr'
import { updateIntegrationSettings } from './integrations'
import { getMessageTemplates, sendMessage, updateMessageTemplates } from './messages'
import { createPatient, searchPatients, updatePatient, verifyAbha } from './patients'
import { setOverridePin } from './users'
import { saveVitals } from './vitals'
import { callNext, callVisit, checkIn, getVisit, listVisits, previewCheckIn, referVisit, tvBoard } from './visits'

const today = todayIST()
const newPatient = (o: Partial<PatientInput> = {}): PatientInput => ({
  name: 'Kishor Patankar',
  gender: 'M',
  dob: '1980-05-10',
  dobApprox: false,
  mobile: '9811122233',
  category: 'general',
  allergies: [],
  chronicConditions: [],
  ...o,
})

describe('demo day', () => {
  it('has patients, today’s queue in every state, a discount awaiting approval and pending orders', async () => {
    await loginAs('admin')
    expect((await searchPatients('', 100)).length).toBeGreaterThanOrEqual(45)
    const visits = await listVisits()
    const states = new Set(visits.map((v) => v.status))
    for (const s of ['completed', 'inConsultation', 'vitalsDone', 'billed', 'checkedIn']) expect(states).toContain(s)
    expect((await listBills()).pendingApprovals).toBe(1)
    expect(visits.some((v) => v.pendingCharges === 2)).toBe(true)
  })

  it('finds patients by UHID, mobile or name', async () => {
    await loginAs('frontOffice')
    const [ramesh] = await searchPatients('Ramesh Kul')
    expect(ramesh!.uhid).toMatch(/^SUN-\d{4}-\d{6}$/)
    expect((await searchPatients(ramesh!.uhid))[0]!.id).toBe(ramesh!.id)
    expect((await searchPatients(ramesh!.mobile.slice(-6)))[0]!.id).toBe(ramesh!.id)
  })
})

describe('registration (OPD-01)', () => {
  it('generates a UHID and warns about possible duplicates', async () => {
    await loginAs('frontOffice')
    const p = await createPatient(newPatient())
    expect(p.uhid).toMatch(/^SUN-\d{4}-\d{6}$/)
    const err = await createPatient(newPatient({ name: 'Kishor P Patankar' })).catch((e: ApiError) => e)
    expect(err).toMatchObject({ code: 'possible_duplicate' })
    expect((err as ApiError).details).toHaveLength(1)
    // A family member on the same mobile is fine; so is confirming.
    await createPatient(newPatient({ name: 'Rutuja Patankar', gender: 'F', dob: '2012-01-01' }))
    await createPatient(newPatient({ name: 'Kishor P Patankar', confirmNotDuplicate: true }))
  })
})

describe('check-in fee rules (OPD-05)', () => {
  it('detects the free follow-up (4 days) and the paid follow-up (15 days)', async () => {
    await loginAs('frontOffice')
    const [ramesh] = await searchPatients('Ramesh Kulkarni')
    const [sunita] = await searchPatients('Sunita Deshpande')
    const free = await previewCheckIn({ patientId: ramesh!.id, doctorId: 'doc-vikram', payerId: 'cash', category: 'general' })
    expect(free).toMatchObject({ visitType: 'freeFollowUp', feePaise: 0 })
    const fu = await previewCheckIn({ patientId: sunita!.id, doctorId: 'doc-vikram', payerId: 'cash', category: 'general' })
    expect(fu).toMatchObject({ visitType: 'followUp', feePaise: 30000 })
  })

  it('asks for panel documents and prior approval', async () => {
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ mobile: '9822200011' }))
    await expect(checkIn({ patientId: p.id, doctorId: 'doc-vikram', visitType: 'new', payerId: 'panel-mediassist', category: 'general' })).rejects.toMatchObject({ code: 'documents' })
    await expect(
      checkIn({ patientId: p.id, doctorId: 'doc-vikram', visitType: 'new', payerId: 'panel-mediassist', category: 'general', panelDocuments: ['Insurance / TPA card', 'Aadhaar'] }),
    ).rejects.toMatchObject({ code: 'approval' })
  })
})

describe('a full visit', () => {
  it('register → check in → bill → pay → vitals → consult → order → bill tests', async () => {
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ mobile: '9833300011' }))
    const v = await checkIn({ patientId: p.id, doctorId: 'doc-vikram', visitType: 'new', payerId: 'cash', category: 'general' })
    expect(v.tokenNo).toBeGreaterThan(1)

    // Pay before consultation: the doctor cannot call an unpaid token.
    await loginAs('doctor')
    await expect(callVisit(v.id)).rejects.toMatchObject({ code: 'busy' }) // someone is already in consultation

    await loginAs('cashier')
    const ctx = await getBillingContext(v.id)
    expect(ctx.suggested).toHaveLength(1)
    const bill = await createBill(v.id, { lines: ctx.suggested, discountPercent: 0 })
    expect(bill.patientNetPaise).toBe(50000)
    await expect(takePayment(bill.id, { lines: [{ mode: 'upi', amountPaise: 50000 }] })).rejects.toMatchObject({ code: 'reference' })
    await expect(takePayment(bill.id, { lines: [{ mode: 'cash', amountPaise: 40000 }] })).rejects.toMatchObject({ code: 'amount' })
    const receipt = await takePayment(bill.id, { lines: [{ mode: 'cash', amountPaise: 20000 }, { mode: 'upi', amountPaise: 30000, reference: 'UTR123456' }] })
    expect(receipt.receiptNo).toMatch(/^RCP\/\d{4}-\d{2}\/\d{6}$/)

    await loginAs('nurse')
    await saveVitals(v.id, { bpSys: 150, bpDia: 95, pulse: 88, tempF: 98.6, weightKg: 72, heightCm: 168 })

    await loginAs('doctor')
    // Finish the patient already inside, then call this one.
    const inside = (await listVisits({ doctorId: 'doc-vikram' })).find((x) => x.status === 'inConsultation')!
    const c0 = await getConsultation(inside.id)
    await completeConsultation(inside.id, { ...c0.note, diagnoses: [{ code: 'R51', name: 'Headache', type: 'final' }] })
    await callVisit(v.id)
    const c = await getConsultation(v.id)
    expect(c.vitals?.bmi).toBe(25.5)
    await saveNote(v.id, { ...c.note, complaints: ['Fever'] })
    await orderServices(v.id, ['svc-clinic-sunrise-cbc', 'svc-clinic-sunrise-lipid'])
    await expect(completeConsultation(v.id, c.note)).rejects.toMatchObject({ code: 'diagnosis' })
    await completeConsultation(v.id, { ...c.note, complaints: ['Fever'], diagnoses: [{ code: 'I10', name: 'Essential (primary) hypertension', type: 'final' }] })
    await expect(saveNote(v.id, c.note)).rejects.toMatchObject({ code: 'locked' })

    await loginAs('cashier')
    const after = await getBillingContext(v.id)
    expect(after.suggested.map((l) => l.orderId).filter(Boolean)).toHaveLength(2)
    const tests = await createBill(v.id, { lines: after.suggested, discountPercent: 0 })
    expect(tests.patientNetPaise).toBe(35000 + 65000)
  })
})

describe('discounts and cancellation', () => {
  it('a discount above the cashier’s 0% limit waits for an approver', async () => {
    await loginAs('cashier')
    const pending = (await listBills()).rows.find((r) => r.discountPending)!
    await expect(takePayment(pending.id, { lines: [{ mode: 'cash', amountPaise: 1 }] })).rejects.toMatchObject({ code: 'pending_discount' })
    await expect(decideDiscount(pending.id, true)).rejects.toMatchObject({ status: 403 })
    await loginAs('admin') // 20% limit: not enough for 30%
    await expect(decideDiscount(pending.id, true)).rejects.toMatchObject({ code: 'limit' })
  })

  it('senior citizens get the category discount without approval; cancelling refunds', async () => {
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ name: 'Vasant Gore', mobile: '9844400011', dob: '1950-01-01', category: 'senior' }))
    const v = await checkIn({ patientId: p.id, doctorId: 'doc-harish', visitType: 'new', payerId: 'cash', category: 'senior' })
    await loginAs('cashier')
    const ctx = await getBillingContext(v.id)
    expect(ctx.categoryDiscountPercent).toBe(10)
    const b = await createBill(v.id, { lines: ctx.suggested, discountPercent: 10, discountReason: 'SENIOR' })
    expect(b.discount?.status).toBe('auto')
    expect(b.patientNetPaise).toBe(45000)
    await takePayment(b.id, { lines: [{ mode: 'cash', amountPaise: 45000 }] })
    await expect(cancelBill(b.id, 'Wrong service')).rejects.toMatchObject({ status: 403 }) // cashier has no cancel
    await loginAs('admin')
    const cancelled = await cancelBill(b.id, 'Wrong service billed')
    expect(cancelled.receipts.map((r) => r.totalPaise)).toEqual([45000, -45000])
    expect((await getBillingContext(v.id)).suggested).toHaveLength(1)
  })

  it('panel patients: the panel pays its share', async () => {
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ name: 'Sachin Tata', mobile: '9855500011' }))
    const v = await checkIn({ patientId: p.id, doctorId: 'doc-harish', visitType: 'new', payerId: 'panel-tata', category: 'general', panelDocuments: ['Employee ID card'] })
    await loginAs('cashier')
    const b = await createBill(v.id, { lines: (await getBillingContext(v.id)).suggested, discountPercent: 0 })
    // Tata Motors: ₹450 panel consultation rate (doctor-specific cash rate ₹500 wins by specificity), 10% co-pay.
    expect(b.grossPaise).toBe(50000)
    expect(b.patientNetPaise).toBe(5000)
    expect(b.panelPaise).toBe(45000)
  })
})

describe('supervisor PIN override for discounts', () => {
  it('lets a supervisor approve a discount on the spot with their PIN, skipping the pending queue', async () => {
    await loginAs('admin')
    await setOverridePin('user-accounts', { pin: '4321' }) // Accounts: 20% limit
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ name: 'Ajay More', mobile: '9844400022' }))
    const v = await checkIn({ patientId: p.id, doctorId: 'doc-harish', visitType: 'new', payerId: 'cash', category: 'general' })
    await loginAs('cashier')
    const ctx = await getBillingContext(v.id)
    const b = await createBill(v.id, { lines: ctx.suggested, discountPercent: 15, discountReason: 'COURTESY', supervisorOverride: { username: 'kavita.shah', pin: '4321' } })
    expect(b.discount?.status).toBe('approved')
    expect(b.discount?.decidedByName).toBe('Kavita Shah')
    expect(b.patientNetPaise).toBeLessThan(b.patientGrossPaise)
  })

  it('rejects a wrong PIN, a user with no PIN set, or a limit that is still too low', async () => {
    await loginAs('admin')
    await setOverridePin('user-accounts', { pin: '4321' }) // Accounts: 20% limit
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ name: 'Rakesh Jadhav', mobile: '9844400033' }))
    const v = await checkIn({ patientId: p.id, doctorId: 'doc-harish', visitType: 'new', payerId: 'cash', category: 'general' })
    await loginAs('cashier')
    const ctx = await getBillingContext(v.id)
    const draft = { lines: ctx.suggested, discountPercent: 15, discountReason: 'COURTESY' }
    await expect(createBill(v.id, { ...draft, supervisorOverride: { username: 'kavita.shah', pin: '0000' } })).rejects.toMatchObject({ code: 'invalid' })
    await expect(createBill(v.id, { ...draft, supervisorOverride: { username: 'amit.joshi', pin: '4321' } })).rejects.toMatchObject({ code: 'invalid' })
    await expect(createBill(v.id, { ...draft, discountPercent: 60, supervisorOverride: { username: 'kavita.shah', pin: '4321' } })).rejects.toMatchObject({ code: 'limit' })
  })
})

describe('queue and appointments', () => {
  it('call next takes the next paid token; TV shows tokens without names', async () => {
    await loginAs('doctor')
    const inside = (await listVisits({ doctorId: 'doc-meera' })).find((x) => x.status === 'inConsultation')!
    const c0 = await getConsultation(inside.id)
    await completeConsultation(inside.id, { ...c0.note, diagnoses: [{ code: 'J06.9', name: 'URTI', type: 'final' }] })
    const next = await callNext('doc-meera')
    expect(next?.consultPaid).toBe(true)
    const board = await tvBoard().catch(() => null)
    expect(board).toBeNull() // doctors have no TV permission
    await loginAs('frontOffice')
    const tv = await tvBoard()
    const meera = tv.doctors.find((d) => d.doctorId === 'doc-meera')!
    expect(meera.nowServing).toBe(next!.token)
    expect(JSON.stringify(tv)).not.toContain('Kadam')
  })

  it('books a slot, rejects a double booking, frees it on cancel', async () => {
    await loginAs('frontOffice')
    const date = addDays(today, 1)
    const day = await getDaySlots('doc-vikram', date)
    const free = day.sessions.flatMap((s) => s.slots).find((s) => !s.appointment)!
    const [p] = await searchPatients('Omkar')
    const a = await bookAppointment({ patientId: p!.id, doctorId: 'doc-vikram', date, slot: free.time })
    const [q] = await searchPatients('Tanvi')
    await expect(bookAppointment({ patientId: q!.id, doctorId: 'doc-vikram', date, slot: free.time })).rejects.toMatchObject({ code: 'taken' })
    await cancelAppointment(a.id, 'Patient called to cancel')
    await bookAppointment({ patientId: q!.id, doctorId: 'doc-vikram', date, slot: free.time })
  })
})

describe('simulated ABHA verification', () => {
  it('needs ABDM turned on and an ABHA number, then marks it verified; a changed number needs re-verifying', async () => {
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ name: 'Abha Test Patient', mobile: '9844400044', abhaNumber: '91-1234-5678-9012' }))
    await expect(verifyAbha(p.id)).rejects.toMatchObject({ code: 'disabled' })

    await loginAs('admin')
    await updateIntegrationSettings({ abdmEnabled: true, smsEnabled: false, whatsappEnabled: false, upiEnabled: true })

    await loginAs('frontOffice')
    const noNumber = await createPatient(newPatient({ name: 'No Abha Patient', mobile: '9844400055' }))
    await expect(verifyAbha(noNumber.id)).rejects.toMatchObject({ code: 'invalid' })

    const verified = await verifyAbha(p.id)
    expect(verified.abhaVerifiedAt).toBeDefined()

    const changed = await updatePatient(p.id, { ...newPatient({ name: 'Abha Test Patient', mobile: '9844400044' }), abhaNumber: '91-1234-5678-9013' })
    expect(changed.abhaVerifiedAt).toBeUndefined()
  })
})

describe('simulated SMS/WhatsApp', () => {
  it('needs the channel turned on, renders the template, and never actually sends anything', async () => {
    await loginAs('frontOffice')
    const p = await createPatient(newPatient({ name: 'Message Test Patient', mobile: '9844400066' }))
    await expect(sendMessage({ channel: 'sms', event: 'billReceipt', patientId: p.id, vars: { billNo: 'B-1', amount: '500' } })).rejects.toMatchObject({ code: 'disabled' })

    await loginAs('admin')
    await updateIntegrationSettings({ abdmEnabled: false, smsEnabled: true, whatsappEnabled: true, upiEnabled: true })
    const t = await getMessageTemplates()
    expect(t.billReceipt).toContain('{patientName}')
    await updateMessageTemplates({ ...t, billReceipt: 'Hi {patientName}, your bill {billNo} for Rs.{amount} is settled.' })

    await loginAs('frontOffice')
    const r = await sendMessage({ channel: 'whatsapp', event: 'billReceipt', patientId: p.id, vars: { billNo: 'B-1', amount: '500' } })
    expect(r.to).toBe(p.mobile)
    expect(r.body).toBe('Hi Message Test Patient, your bill B-1 for Rs.500 is settled.')
  })
})

describe('referral to another doctor (OPD workbench)', () => {
  it('creates a free, linked visit for the other doctor and leaves the original visit intact', async () => {
    await loginAs('doctor')
    const inside = (await listVisits({ doctorId: 'doc-meera' })).find((x) => x.status === 'inConsultation')!
    const referred = await referVisit(inside.id, { toDoctorId: 'doc-vikram', note: 'Needs ortho opinion' })
    expect(referred.doctorId).toBe('doc-vikram')
    expect(referred.waiveConsultation).toBe(true)
    expect(referred.referredFromVisitId).toBe(inside.id)
    expect(referred.visitType).toBe('referral')
    expect(referred.status).toBe('checkedIn')
    const originalAfter = await getVisit(inside.id)
    expect(originalAfter.status).toBe('inConsultation')
    expect(originalAfter.history.some((h) => h.action.includes('Referred to'))).toBe(true)
  })

  it('rejects referring to the same doctor', async () => {
    await loginAs('doctor')
    const inside = (await listVisits({ doctorId: 'doc-meera' })).find((x) => x.status === 'inConsultation')!
    await expect(referVisit(inside.id, { toDoctorId: 'doc-meera' })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('rejects a second referral to a doctor who already has an open visit today', async () => {
    await loginAs('doctor')
    const inside = (await listVisits({ doctorId: 'doc-meera' })).find((x) => x.status === 'inConsultation')!
    await referVisit(inside.id, { toDoctorId: 'doc-vikram' })
    await expect(referVisit(inside.id, { toDoctorId: 'doc-vikram' })).rejects.toMatchObject({ code: 'already_checked_in' })
  })
})
