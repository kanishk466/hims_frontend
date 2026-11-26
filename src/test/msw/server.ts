/**
 * The frontend's unit/component tests exercise the real HTTP client (client.ts/api/*.ts)
 * exactly as the browser does — but there is no live hims-server in the test environment, so
 * MSW intercepts those `fetch` calls here and answers from the same in-memory mock store
 * (src/mock/db.ts) the app used before it was wired to a real backend. Each handler module
 * under src/test/msw/handlers/* is the HTTP-shaped twin of that area's old mock logic: same
 * business rules, same seed data, but reached over a simulated network call so client.ts and
 * api/*.ts never need test-only branches.
 *
 * Only the areas already wired to real HTTP (see each api/*.ts file's own comment) have
 * handlers here. An area still running its old direct-call mock logic needs no handler —
 * its tests never go through fetch at all until that area's own Stage-6 sub-stage wires it.
 */
import { setupServer } from 'msw/node'
import { appointmentsHandlers } from './handlers/appointments.js'
import { auditHandlers } from './handlers/audit.js'
import { authHandlers } from './handlers/auth.js'
import { billingHandlers } from './handlers/billing.js'
import { dayEndHandlers } from './handlers/dayEnd.js'
import { emergencyHandlers } from './handlers/emergency.js'
import { emrHandlers } from './handlers/emr.js'
import { mastersHandlers } from './handlers/masters.js'
import { patientsHandlers } from './handlers/patients.js'
import { platformHandlers } from './handlers/platform.js'
import { reportsHandlers } from './handlers/reports.js'
import { rolesHandlers } from './handlers/roles.js'
import { setupHandlers } from './handlers/setup.js'
import { usersHandlers } from './handlers/users.js'
import { visitsHandlers } from './handlers/visits.js'
import { vitalsHandlers } from './handlers/vitals.js'

export const mswServer = setupServer(
  ...authHandlers,
  ...mastersHandlers,
  ...patientsHandlers,
  ...appointmentsHandlers,
  ...emergencyHandlers,
  ...visitsHandlers,
  ...vitalsHandlers,
  ...emrHandlers,
  ...billingHandlers,
  ...dayEndHandlers,
  ...reportsHandlers,
  ...setupHandlers,
  ...usersHandlers,
  ...rolesHandlers,
  ...auditHandlers,
  ...platformHandlers,
)
