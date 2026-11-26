/**
 * Clinic provisioning (Onboarding & Masters → Tenant provisioning).
 * The real system runs this as one idempotent background job; here it is a
 * synchronous function over the mock store. Used by the platform API and by the seed.
 */
import type { User } from '@/types/auth'
import type { Clinic, CreateClinicInput } from '@/types/clinic'
import { DEFAULT_INTEGRATION_SETTINGS, DEFAULT_MESSAGE_TEMPLATES, DEFAULT_PRINT_SETTINGS } from '@/types/clinic'
import { DEFAULT_OPD_SETTINGS } from '@/types/opd'
import type { DbShape, NumberSeries } from './db'
import { seedClinicMasters } from './seed/masters'
import { ROLE_TEMPLATES } from './seed/roleTemplates'

export const INVITE_VALID_HOURS = 72
export const TRIAL_DAYS = 14

export interface ProvisionOptions {
  now?: Date
  /** Stable ids for seed data. */
  clinicId?: string
  adminUserId?: string
  /** Seed only: admin has already accepted the invite. */
  adminActive?: boolean
}

export interface ProvisionOutput {
  clinic: Clinic
  admin: User
  steps: { label: string; detail: string }[]
}

export const roleId = (clinicCode: string, templateKey: string) => `role-${clinicCode}-${templateKey}`

export function usernameFrom(name: string, taken: (u: string) => boolean): string {
  const base =
    name
      .toLowerCase()
      .replace(/^(dr|mr|mrs|ms)\.?\s+/, '')
      .replace(/[^a-z\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.') || 'user'
  let candidate = base
  for (let n = 2; taken(candidate); n++) candidate = `${base}${n}`
  return candidate
}

export function newInviteToken(): string {
  return `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export function provisionClinic(db: DbShape, input: CreateClinicInput, opts: ProvisionOptions = {}): ProvisionOutput {
  const now = opts.now ?? new Date()
  const at = now.toISOString()
  const clinicId = opts.clinicId ?? crypto.randomUUID()
  const steps: ProvisionOutput['steps'] = []

  // 1–2. Tenant record + subdomain
  const clinic: Clinic = {
    id: clinicId,
    code: input.code,
    uhidPrefix: input.code.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase(),
    name: input.name,
    legalName: input.name,
    addressLine: '',
    city: input.city,
    state: input.state,
    pinCode: '',
    phone: '',
    email: input.adminEmail,
    registrationNo: '',
    financialYearStartMonth: 4,
    nabhStatus: 'none',
    plan: input.plan,
    status: input.plan === 'trial' ? 'trial' : 'active',
    trialEndsAt: input.plan === 'trial' ? new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString() : undefined,
    beds: input.beds,
    createdAt: at,
    opdSettings: { ...DEFAULT_OPD_SETTINGS, upiId: `${input.code}@icici` },
    printSettings: { ...DEFAULT_PRINT_SETTINGS },
    integrations: { ...DEFAULT_INTEGRATION_SETTINGS },
    messageTemplates: { ...DEFAULT_MESSAGE_TEMPLATES },
  }
  db.clinics.push(clinic)
  steps.push({ label: 'Clinic record', detail: `${clinic.name}, ${clinic.city} · ${clinic.status === 'trial' ? `trial until ${clinic.trialEndsAt!.slice(0, 10)}` : 'active'}` })
  steps.push({ label: 'Web address', detail: `${clinic.code}.yourhms.in` })

  // 4. System roles, cloned per clinic
  for (const t of ROLE_TEMPLATES) {
    db.roles.push({
      id: roleId(clinic.code, t.key),
      clinicId,
      templateKey: t.key,
      name: t.name,
      description: t.description,
      isSystem: true,
      permissions: [...t.permissions],
      discountLimitPercent: t.discountLimitPercent,
      active: true,
    })
  }
  steps.push({ label: 'Roles', detail: ROLE_TEMPLATES.map((t) => t.name).join(', ') })

  // 9. Number series
  const series: NumberSeries[] = [
    { clinicId, key: 'uhid', prefix: clinic.uhidPrefix, next: 1, reset: 'never' },
    { clinicId, key: 'visit', prefix: 'OP', next: 1, reset: 'financialYear' },
    { clinicId, key: 'token', prefix: '', next: 1, reset: 'daily' },
    { clinicId, key: 'bill', prefix: 'OPB', next: 1, reset: 'financialYear' },
    { clinicId, key: 'receipt', prefix: 'RCP', next: 1, reset: 'financialYear' },
  ]
  db.numberSeries.push(...series)
  steps.push({ label: 'Number series', detail: `UHID ${clinic.uhidPrefix}-000001, bills, receipts, visits and daily tokens` })

  // 5. First user: Clinic Admin with invite
  const taken = (u: string) => db.users.some((x) => x.username === u)
  const admin: User = {
    id: opts.adminUserId ?? crypto.randomUUID(),
    clinicId,
    name: input.adminName,
    username: usernameFrom(input.adminName, taken),
    mobile: input.adminMobile,
    email: input.adminEmail,
    designation: 'Clinic Administrator',
    isSuperAdmin: false,
    roleIds: [roleId(clinic.code, 'admin')],
    status: opts.adminActive ? 'active' : 'invited',
    createdAt: at,
  }
  if (!opts.adminActive) {
    admin.inviteToken = newInviteToken()
    admin.inviteExpiresAt = new Date(now.getTime() + INVITE_VALID_HOURS * 3_600_000).toISOString()
  }
  db.users.push(admin)
  steps.push({
    label: 'Clinic Admin invite',
    detail: opts.adminActive ? `${admin.name} (active)` : `Sent to ${admin.email} · valid ${INVITE_VALID_HOURS} hours`,
  })

  // 7. Seed masters from templates (value lists, starter services, common drugs)
  seedClinicMasters(db, clinicId, now)
  steps.push({ label: 'Starter masters', detail: 'Value lists, visit types, payment modes, 23 services and 63 common drugs' })

  // 6, 10–11: global reference data (ICD-10), feature flags — later build steps.
  steps.push({ label: 'Setup checklist', detail: 'The admin sees the 8-step setup wizard at first login' })

  return { clinic, admin, steps }
}
