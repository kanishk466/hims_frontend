import { describe, expect, it } from 'vitest'
import { SEED_IDS } from '@/mock/seed'
import { loginAs, loginAsUser } from '@/test/utils'
import { getSession, startPreview } from './auth'
import { getGettingStarted, markTourDone } from './gettingStarted'

describe('getting started', () => {
  it('a new clinic starts with nothing done; links point at the wizard steps', async () => {
    await loginAsUser(SEED_IDS.lotusAdmin)
    const g = await getGettingStarted()
    expect(g.items.filter((i) => i.group === 'setup').every((i) => i.path.startsWith('/admin/setup?step='))).toBe(true)
    expect(g.items.find((i) => i.key === 'testVisit')!.done).toBe(false)
    expect(g.items.find((i) => i.key === 'departments')!.done).toBe(false)
  })

  it('ticks "see as a staff member" once the admin has used it', async () => {
    await loginAs('admin')
    expect((await getGettingStarted()).items.find((i) => i.key === 'preview')!.done).toBe(false)
    await startPreview(SEED_IDS.users.nurse)
    expect((await getGettingStarted()).items.find((i) => i.key === 'preview')!.done).toBe(true)
  })

  it('remembers that the tour was done, per user', async () => {
    await loginAs('admin')
    expect((await getSession()).user.tourDoneAt).toBeUndefined()
    await markTourDone()
    expect((await getSession()).user.tourDoneAt).toBeTruthy()
    expect((await getGettingStarted()).items.find((i) => i.key === 'tour')!.done).toBe(true)
  })

  it('front office cannot read the checklist', async () => {
    await loginAs('frontOffice')
    await expect(getGettingStarted()).rejects.toMatchObject({ status: 403 })
  })
})
