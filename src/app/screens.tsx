import type { ReactNode } from 'react'
import { AuditPage } from '@/features/audit/AuditPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DepartmentsPage } from '@/features/masters/DepartmentsPage'
import { DoctorsPage } from '@/features/masters/DoctorsPage'
import { DrugsPage } from '@/features/masters/DrugsPage'
import { PanelsPage } from '@/features/masters/PanelsPage'
import { SchedulesPage } from '@/features/masters/SchedulesPage'
import { ServicesPage } from '@/features/masters/ServicesPage'
import { ValueListsPage } from '@/features/masters/ValueListsPage'
import { AppointmentsPage } from '@/features/opd/AppointmentsPage'
import { BillingPage } from '@/features/opd/BillingPage'
import { CheckInPage } from '@/features/opd/CheckInPage'
import { DayEndPage } from '@/features/dayEnd/DayEndPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { EmergencyPage } from '@/features/opd/EmergencyPage'
import { PatientsPage } from '@/features/opd/PatientsPage'
import { QueuePage } from '@/features/opd/QueuePage'
import { TvPage } from '@/features/opd/TvPage'
import { VitalsPage } from '@/features/opd/VitalsPage'
import { WorkbenchPage } from '@/features/opd/workbench/WorkbenchPage'
import { ClinicsPage } from '@/features/platform/ClinicsPage'
import { RolesPage } from '@/features/roles/RolesPage'
import { SetupWizardPage } from '@/features/setup/SetupWizardPage'
import { UsersPage } from '@/features/users/UsersPage'

/**
 * Real screens, keyed by menu item key. Menu items without an entry here show
 * the "Coming in step N" placeholder.
 */
export const SCREENS: Record<string, ReactNode> = {
  dashboard: <DashboardPage />,
  clinics: <ClinicsPage />,
  setup: <SetupWizardPage />,
  users: <UsersPage />,
  roles: <RolesPage />,
  audit: <AuditPage />,
  departments: <DepartmentsPage />,
  doctors: <DoctorsPage />,
  schedules: <SchedulesPage />,
  services: <ServicesPage />,
  panels: <PanelsPage />,
  drugs: <DrugsPage />,
  valueLists: <ValueListsPage />,
  patients: <PatientsPage />,
  appointments: <AppointmentsPage />,
  checkin: <CheckInPage />,
  queue: <QueuePage />,
  tv: <TvPage />,
  billing: <BillingPage />,
  vitals: <VitalsPage />,
  emergency: <EmergencyPage />,
  dayEnd: <DayEndPage />,
  reports: <ReportsPage />,
  workbench: <WorkbenchPage />,
}

export const READY_SCREENS = new Set(Object.keys(SCREENS))
