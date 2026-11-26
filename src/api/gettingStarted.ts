/** "Getting started" for a new clinic's admin: worked out from the data, plus two stored ticks. */
import type { GettingStarted, GettingStartedItem } from '@/types/gettingStarted'
import { computeSetupProgress } from './_setup'
import { endpoint, nowIso, requireClinic, writeAudit, type RequestContext } from './_server'

function build(ctx: RequestContext): GettingStarted {
  const clinicId = requireClinic(ctx)
  const clinic = ctx.db.clinics.find((c) => c.id === clinicId)!
  const setup = computeSetupProgress(ctx.db, clinicId)
  const step = (key: GettingStartedItem['key']) => setup.steps.find((s) => s.key === key)!
  const setupItem = (key: 'profile' | 'departments' | 'doctors' | 'schedules' | 'users', label: string): GettingStartedItem => ({
    key,
    group: 'setup',
    label,
    hint: step(key).hint,
    done: step(key).done,
    path: `/admin/setup?step=${key}`,
  })
  const rolesEdited = ctx.db.auditLog.some((a) => a.clinicId === clinicId && a.entity === 'role' && a.action === 'edit')
  const previewed = ctx.db.auditLog.some((a) => a.clinicId === clinicId && a.action === 'preview')
  const visits = ctx.db.visits.some((v) => v.clinicId === clinicId)
  const items: GettingStartedItem[] = [
    setupItem('profile', 'Hospital profile'),
    setupItem('departments', 'Departments'),
    setupItem('doctors', 'Doctors and fees'),
    setupItem('schedules', 'OPD timings'),
    setupItem('users', 'Staff logins'),
    {
      key: 'roles',
      group: 'goLive',
      label: 'Check what each role can do',
      hint: 'Open Roles & permissions and tick or untick screens for Front Office, Cashier, Nurse and Doctor.',
      done: rolesEdited || !!clinic.gettingStarted?.rolesReviewedAt,
      path: '/admin/roles',
      manual: true,
    },
    {
      key: 'preview',
      group: 'goLive',
      label: 'See the app as a staff member',
      hint: 'On Users, choose "See as this user" to check their menu before they log in.',
      done: previewed,
      path: '/admin/users',
    },
    {
      key: 'testVisit',
      group: 'goLive',
      label: 'Run a test patient through OPD',
      hint: 'Register → check in → bill → vitals → doctor. The strip on each screen shows the next step.',
      done: visits,
      path: '/opd/patients',
    },
    { key: 'tour', group: 'goLive', label: 'Take the 1-minute tour', hint: 'Where things are: menu, search, roles and the OPD flow.', done: !!ctx.user.tourDoneAt, path: '/dashboard?tour=1' },
  ]
  const done = items.filter((i) => i.done).length
  return { items, done, total: items.length, hidden: !!clinic.gettingStarted?.hiddenAt }
}

export function getGettingStarted(): Promise<GettingStarted> {
  return endpoint('admin.setup.view', build)
}

/** "Looks fine" on the roles item. */
export function markRolesReviewed(): Promise<GettingStarted> {
  return endpoint('admin.setup.edit', (ctx) => {
    const clinic = ctx.db.clinics.find((c) => c.id === requireClinic(ctx))!
    clinic.gettingStarted = { ...clinic.gettingStarted, rolesReviewedAt: nowIso() }
    writeAudit(ctx, { action: 'edit', entity: 'clinic', entityId: clinic.id, summary: 'Marked role permissions as reviewed' })
    return build(ctx)
  })
}

/** Hide the card from the dashboard, or bring it back from the user menu. */
export function setGettingStartedHidden(hidden: boolean): Promise<GettingStarted> {
  return endpoint('admin.setup.edit', (ctx) => {
    const clinic = ctx.db.clinics.find((c) => c.id === requireClinic(ctx))!
    clinic.gettingStarted = { ...clinic.gettingStarted, hiddenAt: hidden ? nowIso() : undefined }
    return build(ctx)
  })
}

/** Any user: the tour was finished or skipped, so it does not start on its own again. */
export function markTourDone(): Promise<void> {
  return endpoint(null, (ctx) => {
    if (ctx.previewOf) return // "See as this user" never changes the previewed user
    ctx.user.tourDoneAt = nowIso()
  })
}
