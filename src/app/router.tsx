import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import type { Permission } from '@/auth/permissions'
import { RequirePermission } from '@/auth/RequirePermission'
import { InvitePage } from '@/features/invite/InvitePage'
import { DemoLoginPage } from '@/features/login/DemoLoginPage'
import { LoginPage } from '@/features/login/LoginPage'
import { DepartmentFormPage } from '@/features/masters/DepartmentFormPage'
import { DoctorFormPage } from '@/features/masters/DoctorFormPage'
import { PanelFormPage } from '@/features/masters/PanelFormPage'
import { ScheduleFormPage } from '@/features/masters/ScheduleFormPage'
import { ServiceFormPage } from '@/features/masters/ServiceFormPage'
import { TariffFormPage } from '@/features/masters/TariffFormPage'
import { CheckInRegisterPage } from '@/features/opd/CheckInRegisterPage'
import { EditPatientPage } from '@/features/opd/EditPatientPage'
import { IdentifyEmergencyPatientPage } from '@/features/opd/IdentifyEmergencyPatientPage'
import { PatientDetailPage } from '@/features/opd/PatientDetailPage'
import { RegisterPatientPage } from '@/features/opd/RegisterPatientPage'
import { CreateClinicFormPage } from '@/features/platform/CreateClinicFormPage'
import { EditClinicFormPage } from '@/features/platform/EditClinicFormPage'
import { ConsultationPage } from '@/features/opd/workbench/ConsultationPage'
import { BareLayout } from '@/features/print/PrintLayout'
import { DayEndPrint } from '@/features/print/DayEndPrint'
import { HandoverPrint } from '@/features/print/HandoverPrint'
import { ReceiptPrint } from '@/features/print/ReceiptPrint'
import { ReportPrint } from '@/features/print/ReportPrint'
import { ReportViewPage } from '@/features/reports/ReportViewPage'
import { RoleFormPage } from '@/features/roles/RoleFormPage'
import { RxPrint } from '@/features/print/RxPrint'
import { SlipPrint } from '@/features/print/SlipPrint'
import { UhidCardPrint } from '@/features/print/UhidCardPrint'
import { UserFormPage } from '@/features/users/UserFormPage'
import { HomeRedirect } from './HomeRedirect'
import { AppLayout } from './layout/AppLayout'
import { ALL_MENU_ITEMS, itemPermissions } from './menu'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SCREENS } from './screens'

const guarded = (path: string, permission: Permission | Permission[], element: React.ReactNode): RouteObject => ({
  path,
  element: <RequirePermission permission={permission}>{element}</RequirePermission>,
})

/** Every menu item becomes a route guarded by its "view" permission. */
const menuRoute = (fullScreen: boolean) =>
  ALL_MENU_ITEMS.filter((i) => !!i.fullScreen === fullScreen).map((item) => guarded(item.path, itemPermissions(item), SCREENS[item.key] ?? <ComingSoonPage item={item} />))

/** Screens reached from inside a menu screen (detail pages). */
const detailRoutes: RouteObject[] = [guarded('/opd/patients/:id', 'opd.registration.view', <PatientDetailPage />), guarded('/opd/workbench/:visitId', 'opd.workbench.view', <ConsultationPage />), { path: '/reports/:key', element: <ReportViewPage /> }]

/** Stage 7a: Add/Edit forms that used to be modals, now their own routes. */
const formRoutes: RouteObject[] = [
  guarded('/masters/departments/new', 'masters.departments.create', <DepartmentFormPage />),
  guarded('/masters/departments/:id/edit', 'masters.departments.edit', <DepartmentFormPage />),
  guarded('/masters/doctors/new', 'masters.doctors.create', <DoctorFormPage />),
  guarded('/masters/doctors/:id/edit', 'masters.doctors.edit', <DoctorFormPage />),
  guarded('/masters/panels/new', 'masters.panels.create', <PanelFormPage />),
  guarded('/masters/panels/:id/edit', 'masters.panels.edit', <PanelFormPage />),
  guarded('/masters/services/new', 'masters.services.create', <ServiceFormPage />),
  guarded('/masters/services/:id/edit', 'masters.services.edit', <ServiceFormPage />),
  guarded('/masters/services/tariffs/new', 'masters.tariffs.create', <TariffFormPage />),
  guarded('/masters/services/tariffs/:fromId/change', 'masters.tariffs.create', <TariffFormPage />),
  guarded('/masters/schedules/:doctorId/new', 'masters.schedules.create', <ScheduleFormPage />),
  guarded('/masters/schedules/:doctorId/:scheduleId/edit', 'masters.schedules.edit', <ScheduleFormPage />),
  guarded('/admin/users/new', 'admin.users.create', <UserFormPage />),
  guarded('/admin/users/:id/edit', 'admin.users.edit', <UserFormPage />),
  guarded('/admin/roles/new', 'admin.roles.create', <RoleFormPage />),
  guarded('/admin/roles/new/:copyFromId', 'admin.roles.create', <RoleFormPage />),
  guarded('/platform/clinics/new', 'platform.clinics.create', <CreateClinicFormPage />),
  guarded('/platform/clinics/:id/edit', 'platform.clinics.edit', <EditClinicFormPage />),
  // Stage 7-Patients
  guarded('/opd/patients/new', 'opd.registration.create', <RegisterPatientPage />),
  guarded('/opd/patients/:id/edit', 'opd.registration.edit', <EditPatientPage />),
  guarded('/opd/checkin/register', 'opd.registration.create', <CheckInRegisterPage />),
  guarded('/opd/emergency/identify/:tempId', 'opd.emergency.edit', <IdentifyEmergencyPatientPage />),
]

/** Prints open without the app shell; the toolbar hides on paper. */
const printRoutes: RouteObject[] = [
  guarded('/print/slip/:visitId', 'opd.checkin.print', <SlipPrint />),
  guarded('/print/uhid/:patientId', 'opd.registration.print', <UhidCardPrint />),
  guarded('/print/receipt/:billId', 'opd.billing.print', <ReceiptPrint />),
  guarded('/print/rx/:visitId', 'opd.prescription.print', <RxPrint />),
  guarded('/print/day-end/:date', 'opd.dayEnd.print', <DayEndPrint />),
  // Each report checks its own permission.
  { path: '/print/report/:key', element: <ReportPrint /> },
  guarded('/print/handover/:closingId', ['opd.dayEnd.create', 'opd.dayEnd.print'], <HandoverPrint />),
]

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/login/demo', element: <DemoLoginPage /> },
  { path: '/invite/:token', element: <InvitePage /> },
  { element: <BareLayout />, children: [...menuRoute(true), ...printRoutes] },
  {
    path: '/',
    element: <AppLayout />,
    children: [{ index: true, element: <HomeRedirect /> }, ...menuRoute(false), ...detailRoutes, ...formRoutes, { path: '*', element: <NotFoundPage /> }],
  },
]

export const router = createBrowserRouter(routes)
