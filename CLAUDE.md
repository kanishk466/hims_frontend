# CLAUDE.md — HMS Frontend (OPD first)

Read this file before every task. It holds the rules every coding agent follows on this project.
When an agent repeats a mistake, add a rule here.

## What we are building

The frontend of a cloud Hospital Management System for 50–100 bed hospitals in India, OPD first.
**Mock data only, no backend yet.** Everything must be fully clickable with realistic Indian demo data.

Full requirements: "Hospital Management System (50–100 Beds) — Requirements & Plan" doc
(tabs: OPD Spec, Onboarding & Masters, Development Plan). Story IDs like OPD-05 refer to the OPD Spec tab.

## Stack (do not add alternatives without asking)

- React 19 + TypeScript 7 (strict) + Vite 8
- Mantine 9 (core, dates, notifications, modals, spotlight) + Tabler icons — no other component library, no Tailwind
- React Router 7 (data router, `createBrowserRouter`)
- TanStack Query for all server state
- React Hook Form + Zod 4 (`@hookform/resolvers/zod`) for all forms
- Zustand for client state only (session, current user, UI prefs) — never for server data
- dayjs for dates, Vitest + Testing Library for tests, oxlint for linting

## Architecture rules (most important)

```
screen (features/*) → hook (features/*/queries.ts, TanStack Query) → src/api/* → src/mock/* (in-memory store)
```

1. **Screens never touch the mock store.** Only files in `src/api/` may import from `src/mock/`.
   The `no-restricted-imports` rule in `.oxlintrc.json` enforces this; do not disable it.
2. **Every `src/api/*` function is async and returns a Promise** of a typed DTO from `src/types/`.
   Signatures must look like real HTTP calls, e.g. `listPatients(params): Promise<Page<Patient>>`,
   so we can later swap the body for `http.get('/patients', { params })` without touching screens.
3. The API layer simulates reality: 150–400 ms latency, returns copies (never live store references),
   throws `ApiError` with `{ status, code, message, fieldErrors? }` for 400/403/404/409.
4. **The API layer checks permissions too** (throws 403), not just the UI. Hiding a button is UX, not security.
5. Every record carries `clinicId`; every API call is scoped to the current session's clinic.
   One clinic must never see another clinic's data.
6. Screens call API functions only through TanStack Query hooks (`useQuery`/`useMutation`),
   with query keys from a single `queryKeys` factory per feature. Mutations invalidate the right keys.
7. Zod schemas live in `src/types/` (or `features/*/schema.ts`) and are the single source of the type
   (`z.infer`) — the same schemas the real backend will validate with later.

### Mock store

- `src/mock/db.ts`: one in-memory store of tables (arrays keyed by id), persisted to `localStorage`
  under a versioned key (`hms-mock-db-v1`). Bump the version when the shape changes; old data is reseeded.
- `src/mock/seed/`: deterministic seed with realistic Indian data (names, mobile numbers starting 6–9,
  Indian cities/PIN codes, rupee tariffs, common OPD diagnoses and drugs). Demo clinic: **Sunrise Hospital, Pune**.
- A "Reset demo data" action (admin + login screen) reseeds the store.
- IDs: `crypto.randomUUID()`. Human numbers (UHID, bill no., token) come from per-clinic number series.

## Access control

- **Permission code format:** `<module>.<screen>.<action>`, e.g. `opd.registration.create`, `masters.doctors.edit`.
- **Actions:** `view`, `create`, `edit`, `cancel`, `print`, `approve`. Not every screen uses all six.
- The full list lives in one file, `src/auth/permissions.ts`, as a typed constant (`PERMISSIONS`),
  grouped by module and screen so the role grid can be generated from it. Never use a permission string
  that is not in this list (the `Permission` type enforces it).
- **Role** = named set of permission codes, per clinic. **User** has one or more roles; effective
  permissions = union. Super-admin is a platform role, separate from clinic roles.
- `<Can permission="...">` **hides** its children when the user lacks the permission (no disabled
  buttons, no "access denied" toast). `useCan(permission)` for logic.
- Menu items and routes declare a `view` permission; the sidebar and router both filter on it.
  A hidden route visited by URL shows a simple 403 page.
- Demo login lets you pick a user (Super Admin, Admin, Front Office, Cashier, Nurse, Doctor), plus
  "Other users" (other clinics, and people invited during the demo). No passwords in the mock.
- Seeded roles per clinic (cloned at provisioning): Clinic Admin, Front Office, Cashier, Nurse, Doctor,
  Accounts, MD (read-only). Templates live in `src/mock/seed/roleTemplates.ts`.

## Healthcare and India rules (non-negotiable)

- **Money is integer paise** (`amountPaise: number`), never floats. Format only at display:
  `₹1,25,000.00` with `en-IN` grouping via `formatINR()`.
- **Clinical and billing records are never deleted.** They are cancelled with a reason
  (`status: 'cancelled'`, `cancelReason`, `cancelledBy`, `cancelledAt`). Masters are deactivated, not deleted.
- **Timestamps stored as UTC ISO strings, shown in IST** (`Asia/Kolkata`). Dates shown as `DD-MM-YYYY`,
  times as `hh:mm A`.
- No patient data (names, mobile, UHID, diagnoses) in `console.log`, error messages to analytics, or URLs
  other than opaque ids.
- Indian formats: mobile 10 digits (6–9 first), PIN 6 digits, age shown as "34 Y" / "8 M" / "12 D",
  ABHA number 14 digits (`XX-XXXX-XXXX-XXXX`).
- Audit: every create/edit/cancel in the API layer writes an `auditLog` entry (who, when, what, before/after).

## UX rules

- **As simple as possible.** Fewest clicks; the common path must not need the mouse.
- Keyboard: first field autofocused; Enter submits single-step forms; Esc closes modals;
  logical Tab order; `Ctrl+K` opens global search (patient by name/mobile/UHID);
  show shortcuts next to buttons where they exist (e.g. "Save (Ctrl+S)").
- Clear, plain labels ("Mobile number", not "Contact"). Required fields marked. Errors say how to fix
  ("Enter a 10-digit mobile number").
- Every list: search box, sensible default sort, empty state with the next action, loading skeletons.
- Destructive or irreversible actions (cancel bill, cancel visit) ask for a reason in a modal.
- Desktop first (1366×768 counter screens), usable on a tablet for nurse/doctor screens.
- Print views use print CSS (A4, A5, 80 mm thermal) — no PDF libraries in the mock phase.

## Lessons learned (add one each time an agent repeats a mistake)

- Never call `queryClient.clear()` inside a mutation hook: it also wipes the mutation cache, so the
  screen's own `onSuccess` never runs. Use `queryClient.removeQueries()`.
- When a mutation unmounts its own component (logout, reset, switch user), `await mutation.mutateAsync()`
  and then navigate. Per-call `mutate(..., { onSuccess })` callbacks do not fire after unmount.
- Keep render pure: no `new Date()` in render; use `useNow()` from `src/lib/useNow.ts`.
- Seed ids are stable (`SEED_IDS` in `src/mock/seed`), so tests and bookmarks survive "Reset demo data".
- Mantine 9: `Grid` takes `gap`, not `gutter`. Check `node_modules/@mantine/*/lib/**/*.d.ts` when unsure of a prop.
- React Hook Form: read live values with `useWatch({ control, name })`, never `watch()` in render (the linter flags it).
- Do not `setState` inside an effect to reset a modal; reset in the close handler.
- A form modal with a preset first field must autofocus the next empty field, or its dropdown covers the form.
- Clinic setup progress is computed from data (`src/api/_setup.ts`), never stored; only `setupCompletedAt` is stored.
- Any action that changes who the user is (login, logout, reset, "See as this user") unmounts the
  current screen: always `await mutateAsync()` and then `navigate()`.
- "See as this user" is enforced in `authenticate()` (`src/api/_server.ts`): permissions become the
  previewed user's and every non-view/print permission check fails with `preview_read_only`.
  New endpoints get this for free as long as they declare their permission in `endpoint()`.
- Role permissions are normalised on the server: any action implies View (`normalisePermissions`).
  Clinic Admin (`templateKey: 'admin'`) is locked to full access.
- Tests render Mantine with `env="test"` (no transitions/portals); async queries wait 3 s. In tests,
  Mantine `Select` inputs have role `combobox`.
- Prices come only from `lookupPrice()` (`src/lib/pricing.ts`) via the `checkPrice` API: most specific
  approved tariff (doctor 8, payer 4, visit type 2, category 1), else the service default; panels on
  "hospital tariff ± %" adjust the cash price. Tariffs are never edited: a change is a new version.
- Doctor fees are the source of consultation tariffs (`syncConsultationTariffs`): changing a fee adds a
  version from today. Value list items with `locked: true` are referenced by code in logic.
- Dates without time (tariff validity, leave) are `YYYY-MM-DD` strings in IST (`todayIST()`), never Date.
- New clinics are created only through `provisionClinic()` (`src/mock/provision.ts`); the seed uses it too.
  It also seeds per-clinic masters (`src/mock/seed/masters.ts`): value lists, services, drugs.
- OPD business rules are pure functions in `src/lib/opd/` (visit type, panel split, slots, vitals
  flags, Rx quantity/alerts) with their own tests; APIs call them, screens only show the result.
- Visit status flow: checkedIn → billed → vitalsDone → inConsultation → completed (or cancelled /
  noShow). `canCall` enforces "pay before consultation" and mandatory vitals from `clinic.opdSettings`.
- A completed note is locked; corrections are addenda. Bills are never edited: cancel (refund receipt)
  and bill again. Discounts above the user's role `discountLimitPercent` wait for an approver.
- Prints live under `/print/*` (no app shell, `BareLayout`); the toolbar has `no-print`. `?autoprint=1`
  opens the print dialog, `?back=` adds a Back button. Full-screen menu items (`fullScreen: true`, the TV)
  route through the same layout and open in a new tab.
- Numbers: UHID per clinic, visit/bill/receipt per financial year (`src/mock/numbers.ts`); tokens per
  doctor per day. Seeded visit ids are `vis-<date>-<doctorId>-<token>`.
- Mock DB changes in another tab arrive via the `storage` event (`crossTabSync.ts`), so the TV and
  queue update across tabs. Bump `DB_VERSION` whenever the seed shape changes.
- jsdom lacks `document.fonts`; `src/test/setup.ts` stubs it for Mantine's autosize Textarea.
- Sign-in: `/login` is username (or mobile) + password; `/login/demo` is the no-password picker.
  Every seeded user's password is `demo@123`. Hashes and lockout live in `db.credentials`, never
  on `User`, so no API returns them. Wrong-password errors never reveal whether the username exists.
- The OPD flow strip (`VisitFlow`, rules in `src/lib/opd/flow.ts`) shows a visit's next step and
  links each step to its screen only when the user may view it.
- Clinic admin onboarding: "Getting started" card (`src/api/gettingStarted.ts`, worked out from data
  plus two stored ticks) and the spotlight tour (`src/features/tour`). Tour stops target
  `data-tour="..."` attributes; a stop whose target is missing for the user's role is skipped.
- Formatting: `.prettierrc` (no semicolons, single quotes, width 200). Run prettier only with it;
  after a bulk format, re-check that scripted edits still match.
- `useCan([a, b])` is "any of" by default (`mode: 'any'`); do not use it to gate a UI section that
  should require ALL of several permissions unless you pass `mode: 'all'` or check the real one
  permission that actually matters. (Day-end's "Accounts" tab was wrongly shown to cashiers because
  it checked `[opd.dayEnd.approve, opd.dayEnd.print]` any-of, and cashiers have `print` too.)
- Zustand stores (`useTourStore`, `useSessionStore`, ...) are module singletons: unmounting a test's
  component tree does NOT reset them. `src/test/setup.ts`'s `beforeEach` must explicitly reset every
  store a feature adds, or state from one test (e.g. an auto-started tour left open) leaks into the
  next test and produces a confusing, hard-to-reproduce failure that looks like a timing race but
  isn't. When a UI test fails in the full suite but passes run alone, suspect a non-reset singleton
  before suspecting a render-timing race.
- Large seeded demo history (90 days, ~3.8 MB) makes `buildSeed()` too slow to call on every test
  (many tests force a reseed via `_unloadDb()`). `src/mock/db.ts` caches `JSON.stringify(buildSeed())`
  once per test process when `import.meta.env.MODE === 'test'` and `JSON.parse`s a fresh copy per call;
  everything in `DbShape` must already be plain JSON (ISO date strings, not `Date` objects) for that
  cache to round-trip correctly.
- Casualty/emergency: a real `Department` with `casualty: true` and a duty doctor with an all-day
  schedule, not a special-cased "no department" visit. `appointments.bookAppointment` explicitly
  rejects booking a casualty doctor. A visit with `mlc` set can never be cancelled or marked no-show.
- Day-end: `assertDayOpen`/`assertCanTouchBillDay` are exported from `src/api/dayEnd.ts` and called
  from `src/api/billing.ts`, not duplicated — a closed day blocks new payments, and only Accounts
  (`opd.dayEnd.approve`) can cancel a bill from a closed day, with a reason.
- Reports: one `ReportResult` shape (tiles + optional chart + table + totals) renders every report
  through a single `ReportBody`, reused by both the screen and the print page. Chart colours come
  only from the validated `dataviz` palette tokens (teal.6/blue.6/orange.6/grape.6), always in the
  same order, never ad hoc.
- An optional setup-wizard step ("done" because *some* data already exists) breaks when the seed
  itself creates that data: new clinics ship with several starter services by default, so
  "services done" can't be `customServices > 0`. Use an explicit reviewed/configured timestamp
  (`servicesReviewedAt`, `printConfiguredAt`, `integrationsConfiguredAt`) set only by the user's own
  action, never inferred from counts. A failing `computeSetupProgress` assertion caught this.
  Required-step ordering (`order`/`next`) and the optional steps' own chain (`optionalOrder`/
  `nextOptional`) are kept separate so adding optional steps never changes what "Finish" means.
- Referring a visit to another doctor is not the same as transferring it: `transferVisit()` moves
  the same visit (the original doctor's note continuity is lost); `referVisit()` creates a second,
  linked, free visit for the other doctor and leaves the original visit/note untouched. Both already
  had the fields they needed (`referredFromVisitId`, `waiveConsultation` on `Visit`) before either
  was wired up — check for unused-but-present fields before adding new ones.
- JSX boolean shorthand (`<Foo canEdit ... />`) means `canEdit={true}`, not "forward the `canEdit`
  variable in scope" — easy to write by accident when a prop name matches a local variable. Read it
  back before assuming it's a bug.
- A "Save" button nested inside a parent `<form>` (e.g. a sub-section's own save action) must be
  `type="button"`, or Mantine's default `type="submit"` also fires the parent form's `handleSubmit`.
- Simulated integrations (ABHA verify, SMS/WhatsApp send) never leave the browser: gate on the
  relevant `clinic.integrations.*Enabled` flag, write an audit entry (`writeAudit`, reusing the
  existing `AuditPage` rather than a new log screen), and return a result the UI can show — no
  `fetch`, no `wa.me` link, nothing that could be mistaken for a real network call.
- Excel import (doctors/services/drugs masters): read uploaded rows as raw `unknown[][]` via
  `read-excel-file/browser` and validate each row with the same Zod input schema the manual form
  uses (`doctorInputSchema.safeParse()` etc.), rather than fighting `read-excel-file`'s generic typed
  `schema` option — its types are hard to get right and the project's own schema already gives the
  same per-field error messages the manual form shows. Match free-text enum/lookup columns
  (department code, dosage form, doctor type) case-insensitively against value *or* label
  (`matchImportOption` in `src/lib/excelImport.ts`) so a template filled in with either reads correctly.

## Folder structure

```
src/
  app/            menu.ts (single list of screens), router, screens.tsx, providers, layout, 403/404 pages
  auth/           permissions.ts, roles, session store (Zustand), <Can>, useCan, RequirePermission
  api/            one file per domain: patients.ts, appointments.ts, billing.ts, ... (+ http-like helpers)
  mock/           db.ts, seed/, latency.ts, numberSeries.ts   ← imported ONLY by src/api/
  types/          Zod schemas + inferred types shared by api and forms
  features/       one folder per screen area: onboarding/, setup/, roles/, users/, masters/, opd/...
    <feature>/    pages, components, queries.ts (TanStack hooks), schema.ts
  components/     shared UI (PageHeader, DataTable, MoneyInput, PatientBadge, ...)
  lib/            formatINR, dates (IST), age, validators
```

## Build order (one commit per step, stop for review after each)

1. Project setup, layout (sidebar + top bar), mock store, permission system, demo login.
2. Onboarding: super-admin creates a clinic; clinic setup wizard (profile, departments, doctors, schedules, users).
3. Roles & users: role permission grid (rows = screens, columns = View/Create/Edit/Cancel/Print/Approve),
   user screen, "See as this user".
4. Masters: departments, doctors, schedules, services + tariffs, panels, drugs, value lists.
5. OPD: patient search/registration (UHID, duplicate check), appointments, check-in + token,
   queue + TV display, billing counter (fee rules, panel split, UPI/cash, receipt), vitals,
   doctor workbench (notes, ICD-10, e-prescription, test orders), prescription print.

**After each step: stop, summarise what to click to review it, and wait for approval before the next step.**
Show the plan for a step before coding it.

## Commands

```
npm install
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build — must pass before every commit
npm run lint         # oxlint, warnings fail (includes the mock-import rule)
npm run test         # Vitest
```

## Definition of Done (per step)

- [ ] `npm run build`, `npm run lint`, `npm run test` all pass
- [ ] Every new screen reachable from the menu, filtered by permission; works for each demo user as expected
- [ ] No screen imports from `src/mock/`
- [ ] Business rules (fee rules, panel split, UHID/token numbering, duplicate check) have unit tests
- [ ] Forms fully keyboard-usable; validation messages are plain English
- [ ] Seed data updated so the feature is demo-able immediately after "Reset demo data"
- [ ] Commit message: `step N: <summary>` with a short list of what changed
