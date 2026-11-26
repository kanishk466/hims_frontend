import { CLINIC_PERMISSIONS, type Permission } from '@/auth/permissions'

/**
 * Default roles every new clinic gets at provisioning (OPD Spec → Onboarding & Masters → Roles).
 * They are cloned per clinic, so each clinic can edit its own copy (step 3).
 */
export interface RoleTemplate {
  key: 'admin' | 'frontOffice' | 'cashier' | 'nurse' | 'doctor' | 'accounts' | 'md'
  name: string
  description: string
  permissions: Permission[]
  /** OPD Spec default: Cashier 0%, Admin 20%, MD unlimited. */
  discountLimitPercent: number
}

const p = (...codes: Permission[]) => codes
const viewAll = (prefix: string) => CLINIC_PERMISSIONS.filter((c) => c.startsWith(prefix) && c.endsWith('.view'))

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'admin',
    discountLimitPercent: 20,
    name: 'Clinic Admin',
    description: 'Full access to the clinic: setup, users, masters and all OPD screens.',
    permissions: [...CLINIC_PERMISSIONS],
  },
  {
    key: 'frontOffice',
    discountLimitPercent: 0,
    name: 'Front Office',
    description: 'Registers patients, books appointments, checks patients in and prints tokens.',
    permissions: p(
      'home.dashboard.view',
      'opd.registration.view', 'opd.registration.create', 'opd.registration.edit', 'opd.registration.print',
      'opd.appointments.view', 'opd.appointments.create', 'opd.appointments.edit', 'opd.appointments.cancel',
      'opd.checkin.view', 'opd.checkin.create', 'opd.checkin.cancel', 'opd.checkin.print',
      'opd.queue.view', 'opd.queue.edit', 'opd.tvDisplay.view',
      'opd.emergency.view', 'opd.emergency.create', 'opd.emergency.edit',
      'reports.footfall.view', 'reports.appointments.view',
      'masters.doctors.view', 'masters.schedules.view',
    ),
  },
  {
    key: 'cashier',
    discountLimitPercent: 0,
    name: 'Cashier',
    description: 'Bills OPD visits and collects cash/UPI; can also register and check in patients. Cannot cancel bills.',
    permissions: p(
      'home.dashboard.view',
      'opd.registration.view', 'opd.registration.create', 'opd.registration.edit', 'opd.registration.print',
      'opd.appointments.view', 'opd.appointments.create',
      'opd.checkin.view', 'opd.checkin.create', 'opd.checkin.print',
      'opd.queue.view',
      'opd.billing.view', 'opd.billing.create', 'opd.billing.print',
      'opd.dayEnd.view', 'opd.dayEnd.create', 'opd.dayEnd.print',
      'masters.services.view', 'masters.tariffs.view', 'masters.panels.view',
    ),
  },
  {
    key: 'nurse',
    discountLimitPercent: 0,
    name: 'Nurse',
    description: 'Sees the queue and records vitals before the doctor consultation.',
    permissions: p(
      'home.dashboard.view',
      'opd.registration.view',
      'opd.queue.view',
      'opd.vitals.view', 'opd.vitals.create', 'opd.vitals.edit',
      'opd.emergency.view', 'opd.emergency.create',
    ),
  },
  {
    key: 'doctor',
    discountLimitPercent: 10,
    name: 'Doctor',
    description: 'Consults patients: vitals, notes, diagnosis, e-prescription and test orders.',
    permissions: p(
      'home.dashboard.view',
      'opd.registration.view',
      'opd.queue.view', 'opd.queue.edit',
      'opd.vitals.view', 'opd.vitals.create', 'opd.vitals.edit',
      'opd.workbench.view', 'opd.workbench.create', 'opd.workbench.edit',
      'opd.prescription.view', 'opd.prescription.create', 'opd.prescription.edit', 'opd.prescription.print',
      'opd.orders.view', 'opd.orders.create', 'opd.orders.cancel',
      'opd.emergency.view',
      'reports.doctorRevenue.view', 'reports.diagnoses.view',
      'masters.drugs.view',
    ),
  },
  {
    key: 'accounts',
    discountLimitPercent: 20,
    name: 'Accounts',
    description: 'Approves discounts, cancellations and refunds; manages tariffs and panels; sees the audit log.',
    permissions: p(
      'home.dashboard.view',
      'opd.registration.view',
      'opd.billing.view', 'opd.billing.print', 'opd.billing.cancel', 'opd.billing.approve',
      'opd.dayEnd.view', 'opd.dayEnd.approve', 'opd.dayEnd.print',
      'reports.collection.view', 'reports.collection.print', 'reports.discounts.view', 'reports.discounts.print', 'reports.doctorRevenue.view', 'reports.doctorRevenue.print',
      'masters.services.view', 'masters.services.edit',
      'masters.tariffs.view', 'masters.tariffs.create', 'masters.tariffs.edit', 'masters.tariffs.approve',
      'masters.panels.view', 'masters.panels.create', 'masters.panels.edit',
      'admin.audit.view',
    ),
  },
  {
    key: 'md',
    discountLimitPercent: 100,
    name: 'MD (read-only)',
    description: 'Owner / medical director: sees everything, changes nothing except approving bills.',
    permissions: [
      ...viewAll('home.'),
      ...viewAll('opd.').filter((c) => !c.startsWith('opd.workbench') && !c.startsWith('opd.prescription')),
      ...viewAll('masters.'),
      ...CLINIC_PERMISSIONS.filter((c) => c.startsWith('reports.')),
      'opd.billing.approve',
      'opd.dayEnd.print',
      'admin.audit.view',
    ],
  },
]
