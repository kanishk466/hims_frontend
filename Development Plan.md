# Development Plan — OPD Release

Nov 22, 2026 · @Anthropic

You and coding agents build the OPD release in nine stages over 26 weeks, after a 3-week discovery. The client demo is ready on Apr 23, 2027 and the pilot goes live on Jun 21, 2027. Dates assume discovery starts 1 Dec 2026; move everything together if it starts later. The schedule is tight for one person: if it slips, hold the demo date and move go-live, never testing.

## Timeline

&#91;embedded content: development timeline · 4 phases, 2 milestones\]

The eight weeks between the demo and go-live are for reports, integrations, data migration, UAT and a one- to two-week parallel run with the old system.

## Build order

Each step depends on the one before it. Masters are built just before the OPD step that needs them, so the pilot sees a working part of OPD every two weeks instead of eight weeks of master screens.

1. **Foundation (S0):** project setup, database, tenant isolation, login + MFA, permission framework (permission list, API guards, `<Can>` button component), audit log, CI/CD.
2. **Onboarding (S0–S1):** super-admin creates a clinic → the system seeds roles, settings and reference data → the admin gets an invite → logs in and sets MFA.
3. **Roles, users and access (S1):** role permission grid with button-level control, user screen, "See as this user", supervisor override.
4. **Basic masters + setup wizard (S1):** hospital profile, departments, doctors, schedules, number series.
5. **OPD in the patient's order, each with its own masters:**
   1. Registration + ABHA (S2): patient categories, ID proof types
   2. Appointments + queue (S3): schedules, doctor leave, OPD rooms
   3. Billing (S4): services, tariffs, panels, payment modes, discount reasons
   4. Vitals + EMR (S5): ICD-10, complaints, vitals ranges, clinical templates
   5. e-Prescription + test orders (S6): drugs, frequencies, Rx templates, investigations
6. **Reports, notifications, data migration and hardening (S7–S8),** then go-live.

## Team and roles

You are the only developer. Coding agents write most of the code under your direction, so your time goes into specs, review, testing and the pilot hospital. The build takes 26 weeks, about 8 weeks more than a 6-person team, because review, testing and domain work cannot be split beyond one person.

| Role | Who | Time |
| --- | --- | --- |
| Product owner, architect, reviewer, tester, DevOps | You | Full-time |
| Code, tests, seed data, docs, refactors | Coding agents (for example, Claude Code), 1–3 sessions in parallel | Under your review |
| UI design of the 5 key screens | Freelance designer (optional) | 2–3 weeks during S0–S1 |
| Clinical review of EMR and prescription | One doctor advisor | 2 hours every two weeks |
| Review of billing, tariffs and panels | Pilot hospital's billing head | 1 hour every two weeks |
| Security testing (VAPT) | External CERT-In empanelled firm | Once, in S8 |

Plan your week as roughly 40% writing specs and directing agents, 30% reviewing and testing their output, 20% with the pilot hospital and 10% on operations. Agents bring the speed; correctness is your job.

## Tech stack decisions

The plan uses TypeScript end to end, so you and the agents work in one language. Shared types catch many agent mistakes at compile time, and coding agents are strongest in TypeScript. Every choice below also favours fewer servers for one person to run.

| Layer | Decision | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | One PR changes API and UI together; shared types |
| Backend | NestJS (Node.js LTS), REST, OpenAPI generated from code | Modules map to domains; dependency injection; guards for RBAC and tenancy |
| ORM and migrations | Prisma (schema + migrations); raw SQL for RLS policies and reports | Type-safe queries; reviewed migration files |
| Validation | Zod schemas shared by API and forms | Same rules on both sides; no drift |
| Database | PostgreSQL 16+ with row-level security | Strong transactions for billing; JSONB for settings and templates |
| Cache and jobs | Redis + BullMQ | Imports, SMS/WhatsApp, PDF generation, nightly demo reset |
| Auth | Built-in auth module: argon2 password hashes, short-lived JWT + refresh tokens, TOTP MFA, tenant and roles in the token | No extra server to run alone; move to Keycloak or Cognito later if hospitals need SSO |
| Frontend | React + TypeScript + Vite, TanStack Query, React Hook Form, Mantine or MUI | Fast data-heavy screens; keyboard-friendly forms |
| Real-time queue | WebSocket (Socket.IO) channel per tenant and doctor | TV display and doctor queue update in under 3 s |
| PDF / prints | HTML templates rendered with Playwright (headless Chromium) to PDF; thermal via browser print CSS | One template system for A4, A5 and 80 mm |
| Search | PostgreSQL trigram indexes for patient and drug search | No separate search server until needed |
| File storage | S3 (Mumbai region), signed URLs | Logos, signatures, photos, PDFs |
| Cloud | AWS Mumbai (ap-south-1): one EC2 instance per environment running Docker Compose, RDS PostgreSQL, S3, CloudFront; backups copied to Hyderabad | Data stays in India; managed database, simple app hosting; move to ECS when there are 20+ clinics |
| Infrastructure as code | Terraform | Repeatable environments |
| Observability | OpenTelemetry → Grafana Cloud or CloudWatch; Sentry for errors | Trace slow screens to the query |
| Messaging providers | MSG91 or Gupshup (SMS with DLT, WhatsApp Business API); Razorpay or Cashfree for UPI QR and links | Common Indian providers; final choice in S0 based on pilot's existing accounts |

## Repository and code structure

One monorepo holds a modular monolith. A module may call another only through its exported service, never its tables, so any module can be split into its own service later.

```text
hms/
├─ apps/
│  ├─ api/                    NestJS backend
│  │  └─ src/modules/
│  │     ├─ platform/         tenants, plans, provisioning, feature flags
│  │     ├─ iam/              users, roles, permissions, login, MFA
│  │     ├─ settings/         typed tenant settings, number series
│  │     ├─ masters/          departments, doctors, schedules, services, tariffs, panels, value lists
│  │     ├─ patient/          registration, search, duplicates, merge
│  │     ├─ abdm/             ABHA create/verify, scan-and-share, HFR
│  │     ├─ appointment/      slots, booking, no-show
│  │     ├─ visit/            check-in, tokens, queue, vitals
│  │     ├─ emr/              notes, diagnosis, templates
│  │     ├─ prescription/     e-Rx, drug search, alerts
│  │     ├─ orders/           investigation orders
│  │     ├─ billing/          tariff engine, bills, payments, panel split, day-end
│  │     ├─ imports/          Excel templates, validate, commit
│  │     ├─ documents/        print templates, PDF rendering
│  │     ├─ notifications/    SMS, WhatsApp, email
│  │     ├─ reports/          OPD reports, MD dashboard
│  │     └─ audit/            audit log, clinical access log
│  ├─ web/                    React app (staff)
│  │  └─ src/features/       same names as API modules
│  └─ queue-display/          lightweight TV screen app
├─ packages/
│  ├─ contracts/              Zod schemas + generated API client
│  ├─ ui/                     design system components
│  └─ config/                 eslint, tsconfig, prettier
├─ seeds/                    versioned seed JSON (drugs, departments, templates)
├─ infra/terraform/          AWS environments
├─ docker-compose.yml        local Postgres, Redis, MinIO, Mailpit
├─ docs/adr/                 architecture decision records
├─ docs/specs/               one spec per story, written before an agent starts
└─ CLAUDE.md                 rules and commands every coding agent reads first
```

## Environments, CI/CD and DevOps

There are four environments; a separate Dev environment is not worth running alone. Code reaches production only through the pipeline, never by hand.

| Environment | Purpose | Data | Deploys |
| --- | --- | --- | --- |
| Local | Your machine and the agents' git worktrees, via docker-compose | Seed + fake data | Any time |
| Staging | Integration, nightly E2E, UAT, ABDM sandbox | Fake or anonymised data | Every merge to main |
| Demo | Sales demos ("Sunrise Hospital") | Demo seed, reset nightly at 2 am | Weekly, after the nightly E2E passes |
| Production | Pilot and paying clinics | Real PHI, India region only | Manual approval, Sunday night window |

**Pipeline (GitHub Actions)**

1. On every PR, yours or an agent's: lint, type-check, unit tests, API integration tests on an ephemeral Postgres, build, dependency and secret scan. An agent must get this green before you review.
2. On merge to main: build Docker images, migrate and deploy Staging, run the E2E smoke suite.
3. Nightly: the full E2E suite (the demo script) on Staging; failures go to your phone.
4. Release: promote the same images to Demo and Production with manual approval; keep the previous images for a one-command rollback.

**Operations from day one:** daily automated RDS snapshots plus point-in-time recovery, a monthly restore drill, uptime checks on login and billing, alerts to the team's phones, and a secrets manager instead of environment files.

## Engineering practices

**Working solo with coding agents**

- **Spec before code.** Each story gets a one-page spec in `docs/specs/` before an agent starts: acceptance criteria from the OPD Spec, API contract (Zod schema), edge cases, and which tests must exist.
- **Small vertical slices.** One agent task = one slice (schema + API + screen + tests), ideally under 400 changed lines, so you can review it properly.
- **Parallel, not overlapping.** Run 1–3 agent sessions at once on separate git worktrees for independent work (a master screen, a report, seed data). Never two agents on the same module.
- **Tests are the guardrail.** The agent must get CI green before you review. You review the list of tests before the code; any test an agent changed to make it pass needs your explicit approval.
- **You own the dangerous parts.** You write or review line by line: tenancy and RLS, auth, the tariff and billing engine, migrations and ABDM. Agents may draft them; you approve every line.
- **CLAUDE.md is the team handbook.** It holds the stack, folder rules, commands, coding rules (paise, tenant\_id, no PHI in logs) and Definition of Done. Add a rule each time an agent repeats a mistake.
- **Weekly rhythm.** Monday: plan the week's slices and write specs. Daily: direct agents, review, merge. Thursday every two weeks: demo build to the pilot hospital. Friday: refactor, update docs and CLAUDE.md.
- **Trunk-based.** Short-lived branches, squash-merge to main, feature flags for unfinished work; decisions recorded as short ADRs in `docs/adr/`.

**Non-negotiable rules for healthcare data**

- Every table has tenant\_id with RLS; a CI test tries to read another tenant's data and must fail.
- Money is stored as integer paise, never floating point.
- Clinical and billing records are never hard-deleted; they are cancelled with a reason.
- No PHI in logs, error reports or analytics.
- All timestamps stored in UTC and shown in IST.

**Definition of Done (per story)**

- [ ] Acceptance criteria from the OPD Spec pass: an automated test per criterion, plus your manual check on Staging
- [ ] Unit tests for business rules; API integration test for each endpoint
- [ ] Permission check and tenant isolation covered by tests
- [ ] Audit log entries written for creates, edits and cancels
- [ ] Works with keyboard only on billing and registration screens
- [ ] Screen loads in under 1.5 s with demo-sized data
- [ ] Migration reviewed and reversible
- [ ] Demo seed data updated if the feature needs it
- [ ] User-facing help text and release note written

## Stage backlog

Stages run 2–4 weeks; the riskiest ones (billing, EMR, e-Prescription) get the most time. Each stage ends with something the pilot hospital can click through. Story IDs refer to the OPD Spec tab.

| Stage | Dates (2026–27) | Weeks | Backend | Frontend | Demo at stage end |
| --- | --- | --- | --- | --- | --- |
| S0 Foundation | 21 Dec – 1 Jan | 2 | Monorepo, NestJS skeleton, Prisma, RLS middleware, auth + MFA, tenant + provisioning job, audit module, CI/CD, Staging on AWS, CLAUDE.md | App shell, login, layout, design system basics, permission-aware menu and the Can button component | Super-admin creates a tenant; its admin logs in with MFA |
| S1 Setup and masters | 4 Jan – 15 Jan | 2 | Settings service, number series, hospital profile, departments, doctors, schedules, users/roles, generic value lists, seed loader, Excel import framework | Role permission grid, user screen, "See as this user", setup wizard steps 1–5, master list/edit screens, import preview | Admin sets up a clinic from scratch; imports 50 doctors from Excel |
| S2 Registration | 18 Jan – 29 Jan | 2 | Patient model, UHID, duplicate check, trigram search, ABHA create/verify in ABDM sandbox (OPD-01, 02) | Patient search, registration form, ABHA flow, UHID card print | Register a patient in under 60 s, with ABHA |
| S3 Appointments and queue | 1 Feb – 12 Feb | 2 | Slot generation, booking, no-show job, check-in, tokens, WebSocket queue (OPD-03, 04) | Appointment calendar, check-in, doctor queue, TV display app | Book, check in, watch the TV queue update live |
| S4 Billing and panels | 15 Feb – 12 Mar | 4 | Services, versioned tariffs, panel masters, price lookup engine, bills, payments, panel split, receipts, day-end, UPI QR (OPD-05) | Wizard step 6, tariff and panel screens, keyboard-first billing counter, receipt print, day-end | Cash and panel patients billed correctly; day-end balances |
| S5 Vitals and EMR | 15 Mar – 2 Apr | 3 | Vitals, clinical notes, ICD-10 search, templates, note locking + addendum (OPD-06, 07) | Vitals screen (tablet), doctor workbench with history panel, templates | Doctor completes notes in under 2 minutes |
| S6 e-Prescription and orders | 5 Apr – 23 Apr | 3 | Drug search, Rx, allergy and duplicate alerts, Rx templates, investigation orders to billing, follow-up, referral (OPD-08, 09, 11), PDF service | Rx builder, favourites, test orders, Rx print and WhatsApp share | Full OPD visit end to end: **client demo ready** |
| S7 Reports and integrations | 26 Apr – 21 May | 4 | OPD reports, MD dashboard, SMS/WhatsApp, ABHA scan-and-share, emergency registration (OPD-14), data migration scripts, demo tenant + nightly reset | Reports, dashboard, messaging settings, wizard steps 7–8, test visit | Owner dashboard; migrated pilot data visible |
| S8 Hardening and go-live | 24 May – 18 Jun | 4 | Performance tuning, VAPT fixes, backup restore drill, production setup | Bug fixes, help text, UI polish, staff training | UAT sign-off; parallel run; go-live Mon 21 Jun |

**Buffer:** S8 carries no new features. If a sprint slips, move its unfinished stories into S8 rather than dropping tests or hardening.

## Testing and quality

The demo script is the main automated test: if it passes every night, the product is demo-ready every morning.

| Level | Tool | Scope | When |
| --- | --- | --- | --- |
| Unit | Vitest / Jest | Tariff engine, panel split, fee rules, token numbering, date logic | Every PR |
| API integration | Supertest + Testcontainers Postgres | Every endpoint, permissions, tenant isolation | Every PR |
| End-to-end | Playwright | 15-minute demo script + one test per user story | Every merge (smoke), nightly (full) |
| Performance | k6 | 120 concurrent users per tenant, 500 OPD visits/day, 20 tenants on one cluster | Sprint end from S5 |
| Security | OWASP ZAP in CI; external VAPT in S8 | OWASP Top 10, auth, IDOR across tenants | Weekly scan; VAPT once before go-live |
| ABDM | ABDM sandbox test cases | M1 milestone flows | S2 and S7 |
| UAT | Pilot hospital staff on Staging | Real workflows, printers, peak-hour run | S7–S8 |

**Billing accuracy check:** before go-live, bill 100 real past visits from the pilot's old system in Staging and compare totals. Any difference must be explained.

**Who tests:** there is no separate QA engineer. Agents write tests from each story's acceptance criteria, you review them, and the nightly demo-script run catches regressions. Before each demo to the pilot, spend half a day clicking through the script yourself.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| You are the only developer (illness, burnout, other work) | Everything stops | Keep everything in the repo (specs, ADRs, CLAUDE.md) so a contractor can step in; sustainable hours; S8 has no new features |
| Agent-written code with hidden bugs or security holes | Wrong bills, data leaks | Tests before review; you own tenancy, auth, billing and migrations line by line; CI tenant-isolation test; external VAPT |
| Review becomes the bottleneck | Agents produce more than you can check | Small slices; parallel agents only on low-risk work; cut scope before cutting review |
| No committed pilot hospital | Wrong workflows; nobody to demo to | Sign a pilot agreement during discovery; free first year in exchange for feedback time |
| Scope creep from the pilot ("just add pharmacy") | Go-live slips | Keep a phase-2 list; only OPD stories enter stages |
| Doctors find the EMR slow | Low adoption | Doctor advisor every two weeks; templates and favourites; measure clicks per consult |
| ABDM sandbox delays or API changes | M1 not ready | Register in discovery; ABHA failures never block registration |
| Billing errors with panels and tariffs | Loss of trust, money | Unit tests on the tariff engine; 100-visit comparison before go-live |
| Poor internet at the clinic | Counter stops | Lightweight screens, retry queues, 4G backup router in the go-live checklist |
| Messy data migration | Duplicate or missing patients | Dry runs from S7; duplicate report reviewed by the hospital |
| Data breach | DPDP penalties, reputational damage | RLS tests, MFA, encryption, VAPT, breach response runbook |

## Next two weeks

- [ ] Confirm the pilot hospital and book discovery sessions with front office, billing, doctors and the MD
- [ ] Audit the existing software with the checklist on the Overview tab; collect printouts and the rate card
- [ ] Confirm TypeScript end to end (best fit for one developer with coding agents)
- [ ] Set up the agent workflow: CLAUDE.md, spec template, worktree setup; decide whether to hire a freelance designer for 2–3 weeks
- [ ] Register on the ABDM sandbox and request credentials
- [ ] Open AWS account (Mumbai region), GitHub organisation, domain and email
- [ ] Write ADR-001 (modular monolith), ADR-002 (tenancy with RLS), ADR-003 (money as integer paise)
- [ ] Wireframe the 5 highest-risk screens: registration, billing counter, doctor workbench, Rx builder, setup wizard
