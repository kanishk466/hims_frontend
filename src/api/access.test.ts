import { describe, expect, it } from 'vitest'
import { CLINIC_PERMISSIONS } from '@/auth/permissions'
import { useSessionStore } from '@/auth/sessionStore'
import { SEED_IDS } from '@/mock/seed'
import { loginAs } from '@/test/utils'
import { getSession, startPreview } from './auth'
import { listAudit } from './audit'
import { setViewAs } from './client'
import { createDepartment, listDepartments } from './departments'
import { createRole, listRoleDetails, normalisePermissions, setRoleActive, updateRole } from './roles'
import { updateUser } from './users'

const cashierRole = SEED_IDS.role('cashier')
const adminRole = SEED_IDS.role('admin')

describe('roles', () => {
  it('adds View automatically and ignores unknown codes', () => {
    expect(normalisePermissions(['opd.billing.cancel', 'platform.clinics.view', 'made.up.code'])).toEqual(['opd.billing.cancel', 'opd.billing.view'])
  })

  it('copies a role with its permissions', async () => {
    await loginAs('admin')
    const copy = await createRole({ name: 'Senior Cashier', description: 'Can cancel bills', permissions: [] }, cashierRole)
    const cashier = (await listRoleDetails()).find((r) => r.id === cashierRole)!
    expect(copy.permissions).toEqual(cashier.permissions)
    expect(copy.isSystem).toBe(false)
    await expect(createRole({ name: 'cashier', permissions: [] })).rejects.toMatchObject({ status: 409, fieldErrors: { name: expect.any(String) } })
  })

  it('a permission change reaches a logged-in user on their next request, without logout', async () => {
    await loginAs('cashier')
    const cashierToken = useSessionStore.getState().token!
    expect((await getSession()).permissions).not.toContain('opd.billing.cancel')

    await loginAs('admin')
    const role = (await listRoleDetails()).find((r) => r.id === cashierRole)!
    await updateRole(role.id, { name: role.name, description: role.description, permissions: [...role.permissions, 'opd.billing.cancel'] })

    useSessionStore.getState().setToken(cashierToken)
    expect((await getSession()).permissions).toContain('opd.billing.cancel')
  })

  it('records added and removed permissions in the audit log', async () => {
    await loginAs('admin')
    const role = (await listRoleDetails()).find((r) => r.id === cashierRole)!
    await updateRole(role.id, { name: role.name, description: role.description, permissions: [...role.permissions.filter((p) => p !== 'opd.billing.print'), 'opd.billing.approve'] })
    const [entry] = (await listAudit({ entity: 'role' })).items
    expect(entry!.summary).toContain('1 permission(s) added, 1 removed')
    // Stage 6f: the backend's audit diff has no label catalogue to draw pretty text from, so
    // it records raw permission codes here instead of describePermission()'s pretty labels.
    expect(entry!.details).toContain('+ opd.billing.approve')
    expect(entry!.details).toContain('− opd.billing.print')
  })

  it('keeps Clinic Admin at full access', async () => {
    await loginAs('admin')
    await expect(updateRole(adminRole, { name: 'Clinic Admin', permissions: ['home.dashboard.view'] })).rejects.toMatchObject({ code: 'locked' })
    const admin = (await listRoleDetails()).find((r) => r.id === adminRole)!
    expect(admin.permissions).toHaveLength(CLINIC_PERMISSIONS.length)
  })

  it('will not deactivate a built-in role, or a custom role still in use', async () => {
    await loginAs('admin')
    await expect(setRoleActive(cashierRole, false)).rejects.toMatchObject({ code: 'system_role' })
    const custom = await createRole({ name: 'Billing Supervisor', permissions: ['opd.billing.approve'] })
    await updateUser('user-cashier', { name: 'Amit Joshi', mobile: '9890045678', email: '', designation: 'OPD Cashier', roleIds: [cashierRole, custom.id], doctorId: null, active: true })
    await expect(setRoleActive(custom.id, false)).rejects.toMatchObject({ code: 'in_use' })
  })

  it('needs admin.roles permissions', async () => {
    await loginAs('cashier')
    await expect(listRoleDetails()).rejects.toMatchObject({ status: 403 })
  })
})

describe('See as this user', () => {
  it('shows the app with the other user’s permissions, read-only', async () => {
    await loginAs('admin')
    await startPreview('user-frontoffice')
    setViewAs('user-frontoffice')
    const s = await getSession()
    expect(s.user.name).toBe('Priya Patil')
    expect(s.preview?.realUser.name).toBe('Sanjay Kulkarni')
    expect(s.permissions).toContain('opd.registration.create')
    expect(s.permissions).not.toContain('admin.users.view')
    // Reads that Priya can do work; changes are refused even if Priya could make them.
    expect((await listDepartments()).length).toBeGreaterThan(0)
    await expect(createDepartment({ name: 'Cardiology', type: 'clinical', queueColor: 'red' })).rejects.toMatchObject({ code: 'forbidden' })
    setViewAs('user-does-not-exist')
    await expect(getSession()).rejects.toMatchObject({ code: 'preview_not_allowed' })
    setViewAs(null)
  })

  it('blocks writes in preview even when the previewed user may write', async () => {
    await loginAs('admin')
    // Give Kavita (Accounts) a role that may add departments, then preview her.
    await createRole({ name: 'Dept editor', permissions: ['masters.departments.create'] }).then((r) =>
      updateUser('user-accounts', { name: 'Kavita Shah', mobile: '9763045612', email: '', designation: 'Accounts Executive', roleIds: [SEED_IDS.role('accounts'), r.id], doctorId: null, active: true }),
    )
    await startPreview('user-accounts')
    setViewAs('user-accounts')
    await expect(createDepartment({ name: 'Cardiology', type: 'clinical', queueColor: 'red' })).rejects.toMatchObject({ code: 'preview_read_only' })
    setViewAs(null)
    const [entry] = (await listAudit({ entity: 'user' })).items
    expect(entry!.summary).toBe('Viewed the app as Kavita Shah')
  })

  it('is not available to users without admin.users.view', async () => {
    await loginAs('cashier')
    await expect(startPreview('user-nurse')).rejects.toMatchObject({ status: 403 })
    setViewAs('user-nurse')
    await expect(getSession()).rejects.toMatchObject({ code: 'preview_not_allowed' })
    setViewAs(null)
  })
})
