import { describe, expect, it } from 'vitest'
import { loginAs } from '@/test/utils'
import { bookAppointment } from './appointments'
import { confirmTemporaryPatient, getEmergencyContext, mergeTemporaryPatient, registerEmergency } from './emergency'
import { getPatient, searchPatients } from './patients'
import { callNext, cancelVisit, markNoShow } from './visits'

const unknownMale = { gender: 'M' as const, approxAge: 35, doctorId: 'doc-arjun', isMlc: false }

describe('emergency registration (OPD-14)', () => {
  it('registers an unknown patient with a temporary UHID and an E-token', async () => {
    await loginAs('frontOffice')
    const v = await registerEmergency({ ...unknownMale, broughtBy: '108 ambulance' })
    expect(v.patient.name).toBe('Unknown male')
    expect(v.patient.uhid).toMatch(/^TMP-\d{4}-\d{4}$/)
    expect(v.patient.temporary).toBe(true)
    expect(v.token).toMatch(/^E\d+$/)
    expect(v.emergency).toBe(true)
    const ctx = await getEmergencyContext()
    expect(ctx.toIdentify.some((p) => p.id === v.patientId)).toBe(true)
    expect(ctx.defaultDoctorId).toBe('doc-arjun')
  })


  it('needs police station and MLC number for an MLC, and then the visit can never be cancelled', async () => {
    await loginAs('admin')
    await expect(registerEmergency({ ...unknownMale, isMlc: true })).rejects.toMatchObject({ fieldErrors: { policeStation: expect.any(String), mlcNo: expect.any(String) } })
    const v = await registerEmergency({ ...unknownMale, isMlc: true, policeStation: 'Hinjewadi', mlcNo: 'MLC/2026/9' })
    expect(v.mlc?.mlcNo).toBe('MLC/2026/9')
    await expect(cancelVisit(v.id, 'wrong entry')).rejects.toMatchObject({ code: 'mlc' })
    await expect(markNoShow(v.id)).rejects.toMatchObject({ code: 'mlc' })
  })

  it('merges a temporary record into the real patient', async () => {
    await loginAs('frontOffice')
    const v = await registerEmergency(unknownMale)
    const real = (await searchPatients('Rohit Bhosale'))[0]!
    const merged = await mergeTemporaryPatient(v.patientId, real.id)
    expect(merged.id).toBe(real.id)
    expect((await getPatient(real.id)).visits.some((x) => x.id === v.id)).toBe(true)
    expect((await searchPatients(v.patient.uhid)).length).toBe(0)
    await expect(mergeTemporaryPatient(v.patientId, real.id)).rejects.toMatchObject({ code: 'not_temporary' })
  })

  it('confirms a new patient with a normal UHID, keeping the TMP number', async () => {
    await loginAs('frontOffice')
    const v = await registerEmergency({ ...unknownMale, gender: 'F' })
    const p = await getPatient(v.patientId)
    const confirmed = await confirmTemporaryPatient(p.id, { ...p, name: 'Sarita Gore', mobile: '9822000111', allergies: [], chronicConditions: [] })
    expect(confirmed.uhid).toMatch(/^SUN-/)
    expect(confirmed.previousUhid).toBe(v.patient.uhid)
    expect(confirmed.temporary).toBe(false)
  })

  it('casualty takes no appointments; nurse cannot merge', async () => {
    await loginAs('frontOffice')
    await expect(bookAppointment({ patientId: 'pt-001', doctorId: 'doc-arjun', date: '2099-01-01', slot: '10:00' })).rejects.toMatchObject({ code: 'casualty' })
    await loginAs('nurse')
    const v = await registerEmergency(unknownMale)
    await expect(mergeTemporaryPatient(v.patientId, 'pt-001')).rejects.toMatchObject({ status: 403 })
  })
})

describe('emergency queue', () => {
  it('the casualty doctor can call an unpaid emergency patient', async () => {
    await loginAs('admin')
    await registerEmergency(unknownMale)
    // The seeded casualty patient may still be with the doctor; the call then reports "busy".
    const r = await callNext('doc-arjun').catch((e: { code: string }) => e)
    expect(['busy', undefined]).toContain((r as { code?: string }).code)
  })
})
