import { describe, expect, it } from 'vitest'
import { ALL_MENU_ITEMS } from '@/app/menu'
import { ROLE_TEMPLATES } from '@/mock/seed/roleTemplates'
import type { Role } from '@/types/auth'
import { ALL_PERMISSIONS, CLINIC_PERMISSIONS, isPermission, PLATFORM_PERMISSIONS } from './permissions'
import { resolvePermissions } from './resolve'

const role = (id: string, permissions: Role['permissions'], extra: Partial<Role> = {}): Role => ({
  id,
  clinicId: 'c1',
  name: id,
  description: '',
  isSystem: false,
  permissions,
  discountLimitPercent: 0,
  active: true,
  ...extra,
})

describe('permission catalogue', () => {
  it('has unique codes in module.screen.action form', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length)
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z]+\.[a-zA-Z]+\.(view|create|edit|cancel|print|approve)$/)
    expect(isPermission('opd.registration.create')).toBe(true)
    expect(isPermission('opd.registration.delete')).toBe(false)
  })

  it('keeps platform permissions out of clinic roles', () => {
    expect(CLINIC_PERMISSIONS.some((p) => p.startsWith('platform.'))).toBe(false)
    for (const t of ROLE_TEMPLATES) expect(t.permissions.every((p) => CLINIC_PERMISSIONS.includes(p))).toBe(true)
  })

  it('guards every menu item with a "view" permission', () => {
    for (const item of ALL_MENU_ITEMS) expect(item.permission.endsWith('.view')).toBe(true)
  })
})

describe('resolvePermissions', () => {
  const user = { isSuperAdmin: false, clinicId: 'c1', roleIds: ['a', 'b'] }

  it('is the union of the user’s roles', () => {
    const roles = [role('a', ['opd.vitals.view', 'opd.queue.view']), role('b', ['opd.queue.view', 'opd.billing.view'])]
    expect(resolvePermissions(user, roles)).toEqual(['opd.billing.view', 'opd.queue.view', 'opd.vitals.view'])
  })

  it('ignores inactive roles, roles not assigned, and roles of another clinic', () => {
    const roles = [
      role('a', ['opd.vitals.view'], { active: false }),
      role('b', ['opd.queue.view'], { clinicId: 'other' }),
      role('c', ['opd.billing.view']),
    ]
    expect(resolvePermissions(user, roles)).toEqual([])
  })

  it('gives super-admins platform permissions only', () => {
    const roles = [role('a', [...CLINIC_PERMISSIONS])]
    expect(resolvePermissions({ isSuperAdmin: true, clinicId: null, roleIds: ['a'] }, roles)).toEqual([...PLATFORM_PERMISSIONS])
  })
})
