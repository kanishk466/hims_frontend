/**
 * The single list of every permission in the system.
 * Code format: <module>.<screen>.<action>, e.g. "opd.registration.create".
 *
 * The role permission grid (step 3) is generated from this catalogue, so add new
 * screens here first. Never use a permission string that is not listed here —
 * the `Permission` type makes that a compile error.
 */

export const ACTIONS = ['view', 'create', 'edit', 'cancel', 'print', 'approve'] as const
export type Action = (typeof ACTIONS)[number]

export const ACTION_LABELS: Record<Action, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  cancel: 'Cancel',
  print: 'Print',
  approve: 'Approve',
}

export const PERMISSION_CATALOGUE = [
  {
    module: 'platform',
    label: 'Platform (super-admin only)',
    platformOnly: true,
    screens: [{ key: 'clinics', label: 'Clinics', actions: ['view', 'create', 'edit'] }],
  },
  {
    module: 'home',
    label: 'Home',
    platformOnly: false,
    screens: [{ key: 'dashboard', label: 'Dashboard', actions: ['view'] }],
  },
  {
    module: 'opd',
    label: 'OPD',
    platformOnly: false,
    screens: [
      { key: 'registration', label: 'Patient registration', actions: ['view', 'create', 'edit', 'print'] },
      { key: 'appointments', label: 'Appointments', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'checkin', label: 'Check-in & tokens', actions: ['view', 'create', 'cancel', 'print'] },
      { key: 'queue', label: 'Doctor queue', actions: ['view', 'edit'] },
      { key: 'tvDisplay', label: 'TV queue display', actions: ['view'] },
      { key: 'billing', label: 'Billing counter', actions: ['view', 'create', 'cancel', 'print', 'approve'] },
      { key: 'vitals', label: 'Vitals', actions: ['view', 'create', 'edit'] },
      { key: 'workbench', label: 'Doctor workbench', actions: ['view', 'create', 'edit'] },
      { key: 'prescription', label: 'e-Prescription', actions: ['view', 'create', 'edit', 'print'] },
      { key: 'orders', label: 'Test orders', actions: ['view', 'create', 'cancel'] },
      { key: 'emergency', label: 'Emergency registration (casualty)', actions: ['view', 'create', 'edit'] },
      { key: 'dayEnd', label: 'Day-end closing', actions: ['view', 'create', 'approve', 'print'] },
    ],
  },
  {
    module: 'reports',
    label: 'Reports',
    platformOnly: false,
    screens: [
      { key: 'mdDashboard', label: 'MD dashboard', actions: ['view'] },
      { key: 'footfall', label: 'Daily footfall', actions: ['view', 'print'] },
      { key: 'collection', label: 'Collection by mode and cashier', actions: ['view', 'print'] },
      { key: 'doctorRevenue', label: 'Doctor-wise revenue', actions: ['view', 'print'] },
      { key: 'appointments', label: 'No-shows and cancellations', actions: ['view', 'print'] },
      { key: 'waitingTime', label: 'Waiting time', actions: ['view', 'print'] },
      { key: 'discounts', label: 'Discounts and cancelled bills', actions: ['view', 'print'] },
      { key: 'diagnoses', label: 'Top diagnoses', actions: ['view', 'print'] },
    ],
  },
  {
    module: 'masters',
    label: 'Masters',
    platformOnly: false,
    screens: [
      { key: 'departments', label: 'Departments', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'doctors', label: 'Doctors', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'schedules', label: 'Doctor schedules', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'services', label: 'Services', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'tariffs', label: 'Tariffs', actions: ['view', 'create', 'edit', 'cancel', 'approve'] },
      { key: 'panels', label: 'Panels (TPA / corporate)', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'drugs', label: 'Drugs', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'valueLists', label: 'Value lists', actions: ['view', 'create', 'edit', 'cancel'] },
    ],
  },
  {
    module: 'admin',
    label: 'Administration',
    platformOnly: false,
    screens: [
      { key: 'setup', label: 'Clinic setup', actions: ['view', 'edit'] },
      { key: 'users', label: 'Users', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'roles', label: 'Roles & permissions', actions: ['view', 'create', 'edit', 'cancel'] },
      { key: 'audit', label: 'Audit log', actions: ['view'] },
    ],
  },
] as const

type Catalogue = (typeof PERMISSION_CATALOGUE)[number]
type ScreenPermission<M extends string, S> = S extends {
  key: infer K extends string
  actions: readonly (infer A extends string)[]
}
  ? `${M}.${K}.${A}`
  : never
type ModulePermission<C> = C extends { module: infer M extends string; screens: readonly (infer S)[] }
  ? ScreenPermission<M, S>
  : never

/** Every valid permission code, e.g. "opd.registration.create". */
export type Permission = ModulePermission<Catalogue>

/** Flat list of every permission code. */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATALOGUE.flatMap((m) =>
  m.screens.flatMap((s) => s.actions.map((a) => `${m.module}.${s.key}.${a}` as Permission)),
)

/** Permissions a clinic role can hold (everything except platform). */
export const CLINIC_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter((p) => !p.startsWith('platform.'))

/** Permissions that belong to the platform super-admin. */
export const PLATFORM_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter((p) => p.startsWith('platform.'))

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS)
export function isPermission(code: string): code is Permission {
  return PERMISSION_SET.has(code)
}

/** Human label for a permission code, e.g. "OPD › Billing counter › Cancel". */
export function describePermission(code: Permission): string {
  const [mod, screen, action] = code.split('.')
  const m = PERMISSION_CATALOGUE.find((x) => x.module === mod)
  const s = m?.screens.find((x) => x.key === screen)
  return `${m?.label ?? mod} › ${s?.label ?? screen} › ${ACTION_LABELS[action as Action] ?? action}`
}
