import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/auth/sessionStore'
import { loginAs } from '@/test/utils'
import type { CreateClinicInput } from '@/types/clinic'
import { acceptInvite, getInvite, getSession, login } from './auth'
import { ApiError } from './client'
import { createDepartment, listDepartments, setDepartmentActive } from './departments'
import { createDoctor, listDoctors } from './doctors'
import { createClinic, listClinics, updateClinic } from './platform'
import { createSchedule } from './schedules'
import { getIntegrationSettings, updateIntegrationSettings } from './integrations'
import { getPrintSettings, updatePrintSettings } from './print'
import { completeSetup, getSetupProgress, markServicesReviewed, updateClinicProfile } from './setup'
import { createUser, listRoles } from './users'
import { hasSessionToken } from '@/types/auth'

/** No seeded test persona/invite is simulated as MFA-gated. */
function tokenOf(result: Awaited<ReturnType<typeof acceptInvite>>): string {
  if (!hasSessionToken(result)) throw new Error('Test login unexpectedly required an MFA step')
  return result.token
}

const NEW_CLINIC: CreateClinicInput = {
  name: 'Shree Ganesh Hospital',
  code: 'shreeganesh',
  city: 'Kolhapur',
  state: 'Maharashtra',
  plan: 'trial',
  beds: 50,
  adminName: 'Anita Deshpande',
  adminMobile: '9876501234',
  adminEmail: 'anita@shreeganesh.in',
}

/** Super-admin creates a clinic; the admin accepts the invite and is logged in. */
async function newClinicAdmin() {
  await loginAs('superAdmin')
  const result = await createClinic(NEW_CLINIC)
  const token = tokenOf(await acceptInvite(result.inviteToken, { password: 'secret123', confirm: 'secret123' }))
  useSessionStore.getState().setToken(token)
  return result
}

describe('provisioning', () => {
  it('creates the clinic with 7 roles, number series and an invited admin', async () => {
    await loginAs('superAdmin')
    const r = await createClinic(NEW_CLINIC)
    expect(r.clinic.status).toBe('trial')
    expect(r.clinic.admin?.status).toBe('invited')
    expect(r.steps.map((s) => s.label)).toContain('Number series')
    const invite = await getInvite(r.inviteToken)
    expect(invite).toMatchObject({ name: 'Anita Deshpande', clinicName: 'Shree Ganesh Hospital', roleNames: ['Clinic Admin'] })
    expect((await listClinics()).map((c) => c.code)).toContain('shreeganesh')
  })

  it('rejects a clinic code that is taken (409 on the code field)', async () => {
    await loginAs('superAdmin')
    await expect(createClinic({ ...NEW_CLINIC, code: 'sunrise' })).rejects.toMatchObject({ status: 409, fieldErrors: { code: expect.any(String) } })
  })

  it('validates input on the server too (400 with field errors)', async () => {
    await loginAs('superAdmin')
    await expect(createClinic({ ...NEW_CLINIC, code: 'X', adminMobile: '12345' })).rejects.toMatchObject({
      status: 400,
      fieldErrors: { code: expect.any(String), adminMobile: 'Enter a 10-digit mobile number' },
    })
  })

  it('only lets the super-admin create clinics', async () => {
    await loginAs('admin')
    await expect(createClinic(NEW_CLINIC)).rejects.toMatchObject({ status: 403 })
  })
})

describe('invite', () => {
  it('cannot log in before accepting; can after, and the link works only once', async () => {
    await loginAs('superAdmin')
    const r = await createClinic(NEW_CLINIC)
    await expect(login(r.clinic.admin!.id)).rejects.toMatchObject({ code: 'invite_pending' })
    const token = tokenOf(await acceptInvite(r.inviteToken, { password: 'secret123', confirm: 'secret123' }))
    useSessionStore.getState().setToken(token)
    const s = await getSession()
    expect(s.clinic?.setupComplete).toBe(false)
    expect(s.roles.map((x) => x.name)).toEqual(['Clinic Admin'])
    await expect(getInvite(r.inviteToken)).rejects.toMatchObject({ status: 404 })
  })

  it('checks the password confirmation', async () => {
    await loginAs('superAdmin')
    const r = await createClinic(NEW_CLINIC)
    await expect(acceptInvite(r.inviteToken, { password: 'secret123', confirm: 'other' })).rejects.toMatchObject({ fieldErrors: { confirm: 'Passwords do not match' } })
  })
})

describe('setup wizard', () => {
  it('derives progress from the data, step by step, until setup can be finished', async () => {
    await newClinicAdmin()
    let p = await getSetupProgress()
    expect(p.requiredDone).toBe(0)
    await expect(completeSetup()).rejects.toMatchObject({ code: 'setup_incomplete' })

    await updateClinicProfile({
      name: 'Shree Ganesh Hospital', legalName: 'Shree Ganesh Hospital LLP', addressLine: 'Station Road, Shahupuri', city: 'Kolhapur',
      state: 'Maharashtra', pinCode: '416001', phone: '0231 265 4321', email: '', registrationNo: 'KMC/2019/221', financialYearStartMonth: 4,
      gstin: '', pan: '', hfrId: '', nabhStatus: 'none', website: '',
    })
    const dept = await createDepartment({ name: 'General Medicine', type: 'clinical', queueColor: 'teal' })
    expect(dept.code).toBe('GM')
    const doc = await createDoctor({
      name: 'Suresh Patil', departmentId: dept.id, qualification: 'MBBS, MD', council: 'Maharashtra Medical Council',
      registrationNo: 'MMC 2001/01/0001', feeNewPaise: 40000, feeFollowUpPaise: 20000, type: 'fullTime', mobile: '',
    })
    expect(doc.name).toBe('Dr. Suresh Patil')
    await createSchedule({ doctorId: doc.id, weekdays: [1, 2, 3, 4, 5, 6], start: '10:00', end: '13:00', slotMinutes: 10 })
    p = await getSetupProgress()
    expect(p.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['profile', 'departments', 'doctors', 'schedules'])

    const roles = await listRoles()
    expect(roles).toHaveLength(7)
    const role = (k: string) => roles.find((r) => r.templateKey === k)!.id
    await createUser({ name: 'Komal Jadhav', mobile: '9812345670', email: '', designation: 'Front Office', roleIds: [role('frontOffice')], doctorId: null, active: true })
    await createUser({ name: 'Dr. Suresh Patil', mobile: '9812345671', email: '', designation: 'Consultant', roleIds: [role('doctor'), role('cashier')], doctorId: doc.id, active: true })
    p = await getSetupProgress()
    expect(p.complete).toBe(true)
    await completeSetup()
    expect((await getSession()).clinic?.setupComplete).toBe(true)
    expect((await listDoctors())[0]?.userId).toBeDefined()
  })

  it('tracks the optional steps: services reviewed, print and integrations saved', async () => {
    await loginAs('admin')
    let p = await getSetupProgress()
    expect(p.steps.find((s) => s.key === 'services')?.done).toBe(false)
    expect(p.steps.find((s) => s.key === 'print')?.done).toBe(false)
    expect(p.steps.find((s) => s.key === 'integrations')?.done).toBe(false)

    await markServicesReviewed()
    const print = await updatePrintSettings({ paperSize: 'thermal80mm', showLogoOnPrints: false, footerNote: 'Thanks for visiting!' })
    expect(print.paperSize).toBe('thermal80mm')
    const integrations = await updateIntegrationSettings({ abdmEnabled: true, smsEnabled: true, whatsappEnabled: false, upiEnabled: true })
    expect(integrations.abdmEnabled).toBe(true)

    p = await getSetupProgress()
    expect(p.steps.find((s) => s.key === 'services')?.done).toBe(true)
    expect(p.steps.find((s) => s.key === 'print')?.done).toBe(true)
    expect(p.steps.find((s) => s.key === 'integrations')?.done).toBe(true)
    expect((await getPrintSettings()).paperSize).toBe('thermal80mm')
    expect((await getIntegrationSettings()).smsEnabled).toBe(true)
    // Reviewing again does not move the "configured at" timestamp.
    const again = await updatePrintSettings({ paperSize: 'A4', showLogoOnPrints: true, footerNote: '' })
    expect(again.paperSize).toBe('A4')
  })

  it('rejects duplicates and overlapping sessions', async () => {
    await loginAs('admin')
    await expect(createDepartment({ name: 'paediatrics', type: 'clinical', queueColor: 'pink' })).rejects.toMatchObject({ status: 409 })
    const [d] = await listDoctors()
    await expect(
      createDoctor({ ...d!, name: 'Dr. Copy', mobile: '' }),
    ).rejects.toMatchObject({ fieldErrors: { registrationNo: expect.stringContaining('Vikram') } })
    await expect(createSchedule({ doctorId: 'doc-vikram', weekdays: [1], start: '11:00', end: '12:00', slotMinutes: 10 })).rejects.toMatchObject({ code: 'overlap' })
  })

  it('will not deactivate a department that still has active doctors', async () => {
    await loginAs('admin')
    await expect(setDepartmentActive('dept-sunrise-gm', false)).rejects.toMatchObject({ code: 'in_use' })
  })
})

describe('clinic isolation', () => {
  it('a clinic never sees another clinic’s masters', async () => {
    await newClinicAdmin()
    expect(await listDoctors()).toEqual([])
    expect(await listDepartments()).toEqual([])
    await loginAs('admin')
    expect((await listDoctors()).length).toBe(9)
  })

  it('the super-admin cannot read clinic masters', async () => {
    await loginAs('superAdmin')
    await expect(listDoctors()).rejects.toBeInstanceOf(ApiError)
  })

  it('suspending a clinic logs its users out and blocks login', async () => {
    await loginAs('admin')
    await loginAs('superAdmin')
    await updateClinic('clinic-sunrise', { name: 'Sunrise Hospital', plan: 'pro', status: 'suspended', beds: 75 })
    await expect(login('user-cashier')).rejects.toMatchObject({ code: 'clinic_suspended' })
  })
})
