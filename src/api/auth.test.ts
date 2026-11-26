import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/auth/sessionStore'
import { loginAs } from '@/test/utils'
import { _unloadDb } from '@/mock/db'
import { acceptInvite, getSession, listDemoUsers, loginWithPassword, logout, requestPasswordReset, resetPassword } from './auth'
import { createUser } from './users'
import { ApiError } from './client'
import { getCurrentClinic } from './clinics'
import { endpoint } from './_server'

describe('auth API', () => {
  it('lists the eight demo users in a fixed order', async () => {
    const users = await listDemoUsers()
    expect(users.filter((u) => u.persona).map((u) => u.persona)).toEqual(['superAdmin', 'admin', 'frontOffice', 'cashier', 'nurse', 'doctor', 'accounts', 'md'])
  })

  it('returns the session with roles and permissions after login', async () => {
    await loginAs('cashier')
    const s = await getSession()
    expect(s.user.name).toBe('Amit Joshi')
    expect(s.clinic?.name).toBe('Sunrise Hospital')
    expect(s.roles.map((r) => r.name)).toEqual(['Cashier'])
    expect(s.permissions).toContain('opd.billing.create')
    expect(s.permissions).not.toContain('opd.billing.cancel')
  })

  it('rejects calls without a session (401)', async () => {
    useSessionStore.getState().clear()
    await expect(getSession()).rejects.toMatchObject({ status: 401 })
  })

  it('rejects calls without the permission (403), even if the UI showed the button', async () => {
    await loginAs('nurse')
    await expect(endpoint('opd.billing.create', () => 'ok')).rejects.toBeInstanceOf(ApiError)
    await expect(endpoint('opd.billing.create', () => 'ok')).rejects.toMatchObject({ status: 403 })
    await expect(endpoint('opd.vitals.create', () => 'ok')).resolves.toBe('ok')
  })

  it('returns copies, so screens cannot change the store by accident', async () => {
    await loginAs('admin')
    const c = await getCurrentClinic()
    c.name = 'Changed'
    expect((await getCurrentClinic()).name).toBe('Sunrise Hospital')
  })

  it('ends the session on logout', async () => {
    await loginAs('doctor')
    await logout()
    await expect(getSession()).rejects.toMatchObject({ status: 401 })
  })
})

describe('password sign-in', () => {
  const fresh = () => {
    _unloadDb()
    localStorage.clear()
  }

  it('signs in with username or mobile and the demo password', async () => {
    fresh()
    expect((await loginWithPassword({ identifier: 'priya.patil', password: 'demo@123' })).token).toMatch(/^mock_/)
    expect((await loginWithPassword({ identifier: '97670 34567', password: 'demo@123' })).token).toMatch(/^mock_/)
  })

  it('does not say whether the username exists', async () => {
    fresh()
    const a = await loginWithPassword({ identifier: 'nobody.here', password: 'x' }).catch((e: ApiError) => e)
    const b = await loginWithPassword({ identifier: 'priya.patil', password: 'wrong' }).catch((e: ApiError) => e)
    expect(a).toBeInstanceOf(ApiError)
    expect((a as ApiError).message).toBe((b as ApiError).message)
  })

  it('warns, then locks after 5 wrong passwords; reset with the mobile code unlocks', async () => {
    fresh()
    const wrong = () => loginWithPassword({ identifier: 'amit.joshi', password: 'nope' }).then(() => null as unknown as ApiError, (e: ApiError) => e)
    for (let i = 0; i < 3; i++) await wrong()
    expect((await wrong()).message).toMatch(/1 more wrong try locks/)
    expect((await wrong()).status).toBe(423)
    const locked = await loginWithPassword({ identifier: 'amit.joshi', password: 'demo@123' }).catch((e: ApiError) => e)
    expect((locked as ApiError).code).toBe('locked')

    const { demoOtp, maskedMobile } = await requestPasswordReset('amit.joshi')
    expect(maskedMobile).toBe('98XXXXXX78')
    const bad = await resetPassword({ identifier: 'amit.joshi', otp: '000000', password: 'newpass123', confirm: 'newpass123' }).catch((e: ApiError) => e)
    expect((bad as ApiError).code).toBe('bad_otp')
    await resetPassword({ identifier: 'amit.joshi', otp: demoOtp!, password: 'newpass123', confirm: 'newpass123' })
    expect((await loginWithPassword({ identifier: 'amit.joshi', password: 'newpass123' })).token).toMatch(/^mock_/)
    await expect(loginWithPassword({ identifier: 'amit.joshi', password: 'demo@123' })).rejects.toThrow(/Wrong username/)
  })

  it('an invited user signs in with the password chosen on the invite page', async () => {
    await loginAs('admin')
    const created = await createUser({ name: 'Komal Jadhav', mobile: '9812345670', email: '', designation: 'Front Office', roleIds: ['role-sunrise-frontOffice'], doctorId: null, active: true })
    await expect(loginWithPassword({ identifier: created.username, password: 'demo@123' })).rejects.toThrow(/invite/)
    await acceptInvite(created.inviteToken, { password: 'welcome123', confirm: 'welcome123' })
    expect((await loginWithPassword({ identifier: created.username, password: 'welcome123' })).token).toMatch(/^mock_/)
  })
})
