/** Server-side: setup progress is computed from the data, never stored separately. */
import type { DbShape } from '@/mock/db'
import { SETUP_STEPS, type SetupProgress, type SetupStepStatus } from '@/types/clinic'

export function computeSetupProgress(db: DbShape, clinicId: string): SetupProgress {
  const clinic = db.clinics.find((c) => c.id === clinicId)
  const departments = db.departments.filter((d) => d.clinicId === clinicId && d.active)
  const doctors = db.doctors.filter((d) => d.clinicId === clinicId && d.active)
  const scheduled = new Set(db.schedules.filter((s) => s.clinicId === clinicId && s.active).map((s) => s.doctorId))
  const users = db.users.filter((u) => u.clinicId === clinicId && u.status !== 'inactive')
  const roleKey = (id: string) => db.roles.find((r) => r.id === id)?.templateKey
  const hasRole = (key: string) => users.some((u) => u.roleIds.some((r) => roleKey(r) === key))

  const profileDone = !!clinic && !!clinic.legalName && !!clinic.addressLine && !!clinic.pinCode && !!clinic.phone && !!clinic.registrationNo
  const unscheduled = doctors.filter((d) => !scheduled.has(d.id)).length
  const customServices = db.services.filter((s) => s.clinicId === clinicId && s.active && !s.auto).length
  const enabledIntegrations = clinic ? (['abdmEnabled', 'smsEnabled', 'whatsappEnabled'] as const).filter((k) => clinic.integrations?.[k]).length : 0
  const servicesDone = !!clinic?.servicesReviewedAt

  const status: Record<string, { done: boolean; hint: string; availableInStep?: number }> = {
    profile: { done: profileDone, hint: profileDone ? 'Complete' : 'Add address, phone and registration number' },
    departments: { done: departments.length > 0, hint: departments.length ? `${departments.length} active` : 'Add at least one department' },
    doctors: { done: doctors.length > 0, hint: doctors.length ? `${doctors.length} doctor${doctors.length === 1 ? '' : 's'}` : 'Add at least one doctor with fees' },
    schedules: {
      done: doctors.length > 0 && scheduled.size > 0,
      hint: doctors.length === 0 ? 'Add doctors first' : unscheduled ? `${unscheduled} doctor(s) without OPD timings` : 'All doctors have timings',
    },
    users: {
      done: hasRole('frontOffice') && hasRole('doctor'),
      hint: [!hasRole('frontOffice') && 'a front office login', !hasRole('doctor') && 'a doctor login'].filter(Boolean).join(' and ').replace(/^(.+)$/, 'Add $1') || `${users.length} user${users.length === 1 ? '' : 's'}`,
    },
    services: { done: servicesDone, hint: servicesDone ? `Reviewed · ${customServices} service${customServices === 1 ? '' : 's'} beyond consultation` : 'Optional · consultation services are created from doctor fees' },
    print: { done: !!clinic?.printConfiguredAt, hint: clinic?.printConfiguredAt ? `Set up for ${clinic.printSettings.paperSize}` : 'Optional · default print layouts work' },
    integrations: { done: !!clinic?.integrationsConfiguredAt, hint: clinic?.integrationsConfiguredAt ? `${enabledIntegrations} of 3 turned on` : 'Optional · ABDM, SMS/WhatsApp, UPI' },
  }

  const steps: SetupStepStatus[] = SETUP_STEPS.map((s) => ({ key: s.key, label: s.label, required: s.required, ...status[s.key]! }))
  const required = steps.filter((s) => s.required)
  const requiredDone = required.filter((s) => s.done).length
  return { steps, requiredDone, requiredTotal: required.length, complete: requiredDone === required.length }
}
