import {
  IconBuildingHospital,
  IconCalendarEvent,
  IconCash,
  IconCategory,
  IconClipboardHeart,
  IconDeviceTv,
  IconHeartbeat,
  IconHistory,
  IconLayoutDashboard,
  IconList,
  IconListNumbers,
  IconPill,
  IconReceipt2,
  IconSettings,
  IconShieldLock,
  IconStethoscope,
  IconUserCheck,
  IconUsers,
  IconUserSearch,
  IconBuildingCommunity,
  IconCalendarTime,
  IconAmbulance,
  IconCashRegister,
  IconChartBar,
  type Icon,
} from '@tabler/icons-react'
import type { Permission } from '@/auth/permissions'

/**
 * The one place screens are declared. The sidebar, the router and Ctrl+K search
 * are all built from this list and filtered by each item's "view" permission.
 */
export interface MenuItem {
  key: string
  label: string
  path: string
  icon: Icon
  permission: Permission
  /** Build step in which the real screen arrives (placeholder until then). */
  step: number
  description: string
  /** Opens in its own tab without the sidebar (e.g. the waiting-room TV). */
  fullScreen?: boolean
  /** Other view permissions that also show this item (e.g. any one report opens Reports). */
  anyOf?: Permission[]
}

/** Every permission that shows a menu item (the user needs any one of them). */
export const itemPermissions = (i: MenuItem): Permission[] => [i.permission, ...(i.anyOf ?? [])]

export interface MenuGroup {
  key: string
  label: string
  items: MenuItem[]
}

export const MENU: MenuGroup[] = [
  {
    key: 'home',
    label: 'Home',
    items: [
      { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: IconLayoutDashboard, permission: 'home.dashboard.view', step: 1, description: 'Today at a glance and your access.' },
    ],
  },
  {
    key: 'opd',
    label: 'OPD',
    items: [
      { key: 'emergency', label: 'Emergency', path: '/opd/emergency', icon: IconAmbulance, permission: 'opd.emergency.view', step: 7, description: 'Casualty: register an unknown patient in seconds with an E-token and MLC details; identify them later.' },
      { key: 'patients', label: 'Patients', path: '/opd/patients', icon: IconUserSearch, permission: 'opd.registration.view', step: 5, description: 'Search patients by name, mobile or UHID; register new patients with a duplicate check.' },
      { key: 'appointments', label: 'Appointments', path: '/opd/appointments', icon: IconCalendarEvent, permission: 'opd.appointments.view', step: 5, description: 'Book, reschedule and cancel appointments by doctor and slot.' },
      { key: 'checkin', label: 'Check-in', path: '/opd/checkin', icon: IconUserCheck, permission: 'opd.checkin.view', step: 5, description: 'Check patients in and issue a token for the doctor queue.' },
      { key: 'queue', label: 'Queue', path: '/opd/queue', icon: IconListNumbers, permission: 'opd.queue.view', step: 5, description: 'Live queue per doctor: waiting, in consultation, done.' },
      { key: 'tv', label: 'TV display', path: '/tv', icon: IconDeviceTv, permission: 'opd.tvDisplay.view', step: 5, description: 'Full-screen token display for the waiting area.', fullScreen: true },
      { key: 'billing', label: 'Billing', path: '/opd/billing', icon: IconCash, permission: 'opd.billing.view', step: 5, description: 'Billing counter: fee rules, panel split, UPI/cash and receipts.' },
      { key: 'dayEnd', label: 'Day-end', path: '/opd/day-end', icon: IconCashRegister, permission: 'opd.dayEnd.view', step: 7, description: 'Cashiers count cash and hand over; Accounts accepts each closing and closes the day.' },
      { key: 'vitals', label: 'Vitals', path: '/opd/vitals', icon: IconHeartbeat, permission: 'opd.vitals.view', step: 5, description: 'Record BP, pulse, temperature, SpO₂, weight and height.' },
      { key: 'workbench', label: 'Doctor workbench', path: '/opd/workbench', icon: IconStethoscope, permission: 'opd.workbench.view', step: 5, description: 'Notes, ICD-10 diagnosis, e-prescription, test orders and prescription print.' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    items: [
      {
        key: 'reports',
        label: 'Reports',
        path: '/reports',
        icon: IconChartBar,
        permission: 'reports.footfall.view',
        anyOf: ['reports.collection.view', 'reports.doctorRevenue.view', 'reports.appointments.view', 'reports.waitingTime.view', 'reports.discounts.view', 'reports.diagnoses.view'],
        step: 7,
        description: 'Footfall, collections, doctor revenue, no-shows, waiting time, discounts and top diagnoses.',
      },
    ],
  },
  {
    key: 'masters',
    label: 'Masters',
    items: [
      { key: 'departments', label: 'Departments', path: '/masters/departments', icon: IconCategory, permission: 'masters.departments.view', step: 4, description: 'Clinical departments such as General Medicine, Paediatrics, Orthopaedics.' },
      { key: 'doctors', label: 'Doctors', path: '/masters/doctors', icon: IconClipboardHeart, permission: 'masters.doctors.view', step: 4, description: 'Doctor profiles, registration numbers, fees and departments.' },
      { key: 'schedules', label: 'Schedules', path: '/masters/schedules', icon: IconCalendarTime, permission: 'masters.schedules.view', step: 4, description: 'OPD days, timings, slot length and leave per doctor.' },
      { key: 'services', label: 'Services & tariffs', path: '/masters/services', icon: IconReceipt2, permission: 'masters.services.view', step: 4, description: 'Billable services and their rates per tariff.' },
      { key: 'panels', label: 'Panels', path: '/masters/panels', icon: IconBuildingCommunity, permission: 'masters.panels.view', step: 4, description: 'TPA, insurance and corporate panels with their tariffs and co-pay rules.' },
      { key: 'drugs', label: 'Drugs', path: '/masters/drugs', icon: IconPill, permission: 'masters.drugs.view', step: 4, description: 'Drug list for e-prescription: generic, brand, strength and form.' },
      { key: 'valueLists', label: 'Value lists', path: '/masters/value-lists', icon: IconList, permission: 'masters.valueLists.view', step: 4, description: 'Small lists such as titles, ID proof types, payment modes and discount reasons.' },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    items: [
      { key: 'setup', label: 'Clinic setup', path: '/admin/setup', icon: IconSettings, permission: 'admin.setup.view', step: 2, description: 'Setup wizard and clinic settings: profile, departments, doctors, schedules and users.' },
      { key: 'users', label: 'Users', path: '/admin/users', icon: IconUsers, permission: 'admin.users.view', step: 3, description: 'Staff logins, their roles, and "See as this user".' },
      { key: 'roles', label: 'Roles & permissions', path: '/admin/roles', icon: IconShieldLock, permission: 'admin.roles.view', step: 3, description: 'Permission grid: screens × View / Create / Edit / Cancel / Print / Approve.' },
      { key: 'audit', label: 'Audit log', path: '/admin/audit', icon: IconHistory, permission: 'admin.audit.view', step: 3, description: 'Who created, changed or cancelled what, and when.' },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    items: [
      { key: 'clinics', label: 'Clinics', path: '/platform/clinics', icon: IconBuildingHospital, permission: 'platform.clinics.view', step: 2, description: 'Create clinics and send the admin their invite.' },
    ],
  },
]

export const ALL_MENU_ITEMS: MenuItem[] = MENU.flatMap((g) => g.items)

/** Menu groups with only the items the user may view; empty groups dropped. */
export function filterMenu(can: (p: Permission) => boolean): MenuGroup[] {
  return MENU.map((g) => ({ ...g, items: g.items.filter((i) => itemPermissions(i).some(can)) })).filter((g) => g.items.length > 0)
}
