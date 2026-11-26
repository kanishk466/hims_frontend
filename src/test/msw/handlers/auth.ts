/**
 * HTTP-shaped twin of src/api/auth.ts's old direct-call mock logic, matched against the real
 * hims-server routes (see hims-server/src/auth/auth.controller.ts) so the real client.ts/auth.ts
 * code — once wired to fetch — is exercised identically in tests (intercepted here) and in
 * dev/prod (hitting the real backend). Business rules and seed data are the same as the old
 * mock; only the transport is now simulated HTTP.
 *
 * One deliberate deviation from the real backend's wire contract: requestPasswordReset's
 * response includes `demoOtp` here (as the old mock always did), so component tests can read
 * the code at the step the UI reaches it, rather than fishing it out of the mock DB directly.
 * The real backend never returns this field — the frontend's `ResetRequestResult.demoOtp` is
 * optional and `ForgotPasswordModal` guards accordingly (Stage 6a).
 */
import { http, type HttpHandler } from 'msw'
import { db, type DbShape } from '@/mock/db'
import { hashPassword } from '@/mock/password'
import { computeSetupProgress } from '@/api/_setup'
import { ApiError } from '@/api/client'
import { requirePermission, validate } from '@/api/_server'
import { acceptInviteSchema, resetPasswordSchema, signInSchema, type AuditEntry, type User } from '@/types/auth'
import { authenticateFromRequest, respond, url } from './common.js'

const WRONG = 'Wrong username or password.'
export const MAX_FAILED_ATTEMPTS = 5
export const LOCK_MINUTES = 15
const RESET_OTP_MINUTES = 10

function startSession(userId: string): string {
  const store = db()
  const token = `mock_${crypto.randomUUID()}`
  store.sessions.push({ token, userId, createdAt: new Date().toISOString() })
  return token
}

function assertCanSignIn(store: DbShape, user: User) {
  if (user.status === 'invited') throw new ApiError(403, 'invite_pending', 'This user has not accepted their invite yet. Use the link in the invite.')
  const clinic = store.clinics.find((c) => c.id === user.clinicId)
  if (clinic?.status === 'suspended') throw new ApiError(403, 'clinic_suspended', `${clinic.name} is suspended. Contact support.`)
}

function writeAudit(store: DbShape, user: User, entry: Omit<AuditEntry, 'id' | 'at' | 'userId' | 'userName' | 'clinicId'>) {
  store.auditLog.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), userId: user.id, userName: user.name, clinicId: user.clinicId, ...entry })
}

function signIn(store: DbShape, user: User, how: string) {
  const token = startSession(user.id)
  user.lastLoginAt = new Date().toISOString()
  writeAudit(store, user, { action: 'login', entity: 'session', summary: `${user.name} logged in (${how})` })
  return { token }
}

/** Username, or a 10-digit mobile number that belongs to exactly one active user. */
function findByIdentifier(store: DbShape, identifier: string): User | undefined {
  const id = identifier.trim().toLowerCase()
  const byName = store.users.find((u) => u.username.toLowerCase() === id && u.status !== 'inactive')
  if (byName) return byName
  const mobile = id.replace(/\D/g, '').slice(-10)
  if (mobile.length !== 10) return undefined
  const matches = store.users.filter((u) => u.mobile === mobile && u.status !== 'inactive')
  if (matches.length > 1) throw new ApiError(409, 'ambiguous_mobile', 'More than one login uses this mobile number. Sign in with your username.')
  return matches[0]
}

const minutesLeft = (until: string) => Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000))
const mask = (mobile: string) => `${mobile.slice(0, 2)}XXXXXX${mobile.slice(-2)}`

function findInvite(store: DbShape, token: string) {
  const user = store.users.find((u) => u.inviteToken === token && u.status === 'invited')
  if (!user) throw new ApiError(404, 'invite_not_found', 'This invite link is not valid or has already been used.')
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date().toISOString()) {
    throw new ApiError(410, 'invite_expired', 'This invite link has expired. Ask your administrator to send a new one.')
  }
  return user
}

export const authHandlers: HttpHandler[] = [
  http.get(url('/auth/demo-users'), () =>
    respond(() => {
      const store = db()
      const PERSONA_ORDER = ['superAdmin', 'admin', 'frontOffice', 'cashier', 'nurse', 'doctor', 'accounts', 'md']
      const rank = (p?: string) => (p ? PERSONA_ORDER.indexOf(p) : 99)
      return store.users
        .filter((u) => u.status !== 'inactive')
        .sort((a, b) => rank(a.persona) - rank(b.persona) || (a.clinicId ?? '').localeCompare(b.clinicId ?? '') || a.name.localeCompare(b.name))
        .map((u) => {
          const roles = store.roles.filter((r) => u.roleIds.includes(r.id))
          const clinic = store.clinics.find((c) => c.id === u.clinicId)
          return {
            id: u.id,
            name: u.name,
            designation: u.designation,
            persona: u.persona,
            roleNames: u.isSuperAdmin ? ['Super Admin'] : roles.map((r) => r.name),
            clinicName: clinic?.name ?? null,
            status: u.status,
            inviteToken: u.status === 'invited' ? u.inviteToken : undefined,
          }
        })
    }),
  ),

  http.post(url('/auth/login'), async ({ request }) => {
    const { userId } = (await request.json()) as { userId: string }
    return respond(() => {
      const store = db()
      const user = store.users.find((u) => u.id === userId)
      if (!user || user.status === 'inactive') throw new ApiError(404, 'user_not_found', 'This user does not exist or is inactive.')
      assertCanSignIn(store, user)
      return signIn(store, user, 'demo picker')
    }, 201)
  }),

  http.post(url('/auth/login-password'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const body = validate(signInSchema, raw)
      const store = db()
      const user = findByIdentifier(store, body.identifier)
      const cred = user && store.credentials.find((c) => c.userId === user.id)
      if (!user || !cred) {
        if (user) assertCanSignIn(store, user)
        throw new ApiError(401, 'bad_credentials', WRONG)
      }
      const now = new Date()
      if (cred.lockedUntil && cred.lockedUntil > now.toISOString()) {
        throw new ApiError(423, 'locked', `Too many wrong passwords. Try again in ${minutesLeft(cred.lockedUntil)} min, or reset your password.`)
      }
      if (cred.passwordHash !== hashPassword(user.id, body.password)) {
        cred.failedAttempts += 1
        let message = WRONG
        if (cred.failedAttempts >= MAX_FAILED_ATTEMPTS) {
          cred.lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString()
          cred.failedAttempts = 0
          writeAudit(store, user, { action: 'deactivate', entity: 'session', entityId: user.id, summary: `${user.name}'s login was locked for ${LOCK_MINUTES} min after ${MAX_FAILED_ATTEMPTS} wrong passwords` })
          throw new ApiError(423, 'locked', `Too many wrong passwords. Your login is locked for ${LOCK_MINUTES} minutes. Reset your password to unlock it now.`)
        }
        const left = MAX_FAILED_ATTEMPTS - cred.failedAttempts
        if (left <= 2) message += ` ${left} more wrong ${left === 1 ? 'try locks' : 'tries lock'} your login for ${LOCK_MINUTES} minutes.`
        throw new ApiError(401, 'bad_credentials', message)
      }
      assertCanSignIn(store, user)
      cred.failedAttempts = 0
      delete cred.lockedUntil
      return signIn(store, user, 'password')
    }, 201)
  }),

  http.post(url('/auth/request-reset'), async ({ request }) => {
    const { identifier } = (await request.json()) as { identifier: string }
    return respond(() => {
      const store = db()
      const user = findByIdentifier(store, identifier)
      const cred = user && store.credentials.find((c) => c.userId === user.id)
      if (!user || !cred) throw new ApiError(404, 'not_found', 'We could not find an active login with that username or mobile number.')
      const code = String(Math.floor(100000 + Math.random() * 900000))
      cred.resetOtp = { code, expiresAt: new Date(Date.now() + RESET_OTP_MINUTES * 60_000).toISOString(), attempts: 0 }
      return { maskedMobile: mask(user.mobile), demoOtp: code }
    })
  }),

  http.post(url('/auth/reset-password'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const body = validate(resetPasswordSchema, raw)
      const store = db()
      const user = findByIdentifier(store, body.identifier)
      const cred = user && store.credentials.find((c) => c.userId === user.id)
      const otp = cred?.resetOtp
      if (!user || !cred || !otp || otp.expiresAt < new Date().toISOString()) throw new ApiError(410, 'otp_expired', 'The code has expired. Ask for a new one.')
      if (otp.code !== body.otp.trim()) {
        otp.attempts += 1
        if (otp.attempts >= 3) delete cred.resetOtp
        throw new ApiError(400, 'bad_otp', otp.attempts >= 3 ? 'Wrong code three times. Ask for a new one.' : 'That code is not right.', { otp: 'Wrong code' })
      }
      assertCanSignIn(store, user)
      cred.passwordHash = hashPassword(user.id, body.password)
      cred.passwordChangedAt = new Date().toISOString()
      cred.failedAttempts = 0
      delete cred.lockedUntil
      delete cred.resetOtp
      writeAudit(store, user, { action: 'reset', entity: 'user', entityId: user.id, summary: `${user.name} reset their password with a mobile code` })
      return signIn(store, user, 'after password reset')
    }, 201)
  }),

  http.post(url('/auth/accept-invite'), async ({ request }) => {
    const raw = (await request.json()) as { token: string; password: string; confirm: string }
    return respond(() => {
      const { password } = validate(acceptInviteSchema, raw)
      const store = db()
      const user = findInvite(store, raw.token)
      user.status = 'active'
      const at = new Date().toISOString()
      store.credentials = store.credentials.filter((c) => c.userId !== user.id)
      store.credentials.push({ userId: user.id, passwordHash: hashPassword(user.id, password), failedAttempts: 0, passwordChangedAt: at })
      delete user.inviteToken
      delete user.inviteExpiresAt
      user.lastLoginAt = new Date().toISOString()
      const token = startSession(user.id)
      writeAudit(store, user, { action: 'activate', entity: 'user', entityId: user.id, summary: `${user.name} accepted the invite` })
      return { token }
    }, 201)
  }),

  http.get(url('/auth/invite/:token'), ({ params }) =>
    respond(() => {
      const store = db()
      const user = findInvite(store, params.token as string)
      const clinic = store.clinics.find((c) => c.id === user.clinicId)
      return {
        token: params.token,
        name: user.name,
        email: user.email,
        clinicName: clinic?.name ?? '',
        roleNames: store.roles.filter((r) => user.roleIds.includes(r.id)).map((r) => r.name),
        expiresAt: user.inviteExpiresAt!,
      }
    }),
  ),

  http.post(url('/auth/logout'), ({ request }) =>
    respond(() => {
      let ctx
      try {
        ctx = authenticateFromRequest(request)
      } catch {
        return undefined // already logged out
      }
      const token = request.headers.get('authorization')!.slice('Bearer '.length).trim()
      ctx.db.sessions = ctx.db.sessions.filter((s) => s.token !== token)
      writeAudit(ctx.db, ctx.user, { action: 'logout', entity: 'session', summary: `${ctx.user.name} logged out` })
    }, 204),
  ),

  http.get(url('/auth/session'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      const clinic = ctx.db.clinics.find((c) => c.id === ctx.clinicId) ?? null
      const shown = ctx.previewOf ?? ctx.user
      const roles = ctx.db.roles.filter((r) => shown.roleIds.includes(r.id) && r.active)
      return {
        user: {
          id: shown.id,
          name: shown.name,
          username: shown.username,
          designation: shown.designation,
          isSuperAdmin: shown.isSuperAdmin,
          clinicId: shown.clinicId,
          doctorId: shown.doctorId,
          tourDoneAt: shown.tourDoneAt,
        },
        clinic: clinic && {
          id: clinic.id,
          code: clinic.code,
          name: clinic.name,
          city: clinic.city,
          status: clinic.status,
          plan: clinic.plan,
          setupComplete: !!clinic.setupCompletedAt || computeSetupProgress(ctx.db, clinic.id).complete,
        },
        roles: roles.map((r) => ({ id: r.id, name: r.name })),
        permissions: [...ctx.permissions].sort(),
        preview: ctx.previewOf ? { realUser: { id: ctx.user.id, name: ctx.user.name } } : null,
      }
    }),
  ),

  http.post(url('/auth/start-preview'), async ({ request }) => {
    const { userId } = (await request.json()) as { userId: string }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.users.view')
      const target = ctx.db.users.find((u) => u.id === userId && u.clinicId === ctx.clinicId && u.status !== 'inactive')
      if (!target) throw new ApiError(404, 'not_found', 'User not found.')
      if (target.id === ctx.user.id) throw new ApiError(400, 'invalid', 'You are already seeing the app as yourself.')
      writeAudit(ctx.db, ctx.user, { action: 'preview', entity: 'user', entityId: target.id, summary: `Viewed the app as ${target.name}` })
      return { name: target.name }
    })
  }),
]
