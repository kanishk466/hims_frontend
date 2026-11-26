import { z } from 'zod'
import type { Permission } from '@/auth/permissions'
import { mobileSchema, optionalEmail } from '@/lib/validators'
import type { Clinic } from './clinic'
import type { IsoDateTime } from './common'

export type { Clinic } from './clinic'

export interface Role {
  id: string
  clinicId: string
  /** Template key for seeded roles ("admin", "doctor", …); undefined for custom roles. */
  templateKey?: string
  name: string
  description: string
  /** System roles are seeded at clinic creation; they can be edited but not deactivated. */
  isSystem: boolean
  permissions: Permission[]
  /** Highest bill discount (% of the patient's share) users with this role may give without approval. */
  discountLimitPercent: number
  active: boolean
}

export type DemoPersona = 'superAdmin' | 'admin' | 'frontOffice' | 'cashier' | 'nurse' | 'doctor' | 'accounts' | 'md'

export const USER_STATUSES = ['invited', 'active', 'inactive'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export interface User {
  id: string
  /** null for platform users (super-admin). */
  clinicId: string | null
  name: string
  username: string
  mobile: string
  email?: string
  designation: string
  isSuperAdmin: boolean
  roleIds: string[]
  /** Doctor record this login belongs to, if any. */
  doctorId?: string
  status: UserStatus
  inviteToken?: string
  inviteExpiresAt?: IsoDateTime
  /** Which demo card this user appears under on the login screen. */
  persona?: DemoPersona
  lastLoginAt?: IsoDateTime
  /** When this user finished or skipped the product tour. */
  tourDoneAt?: IsoDateTime
  createdAt: IsoDateTime
  /** Hashed 4–6 digit PIN: lets this person approve a discount at the counter without signing in (OPD-05). */
  pinHash?: string
}

/** Setting or clearing a user's discount-override PIN (Users screen). */
export const overridePinSchema = z.object({
  pin: z.union([z.literal(null), z.string().regex(/^\d{4,6}$/, '4–6 digits')]),
})
export type OverridePinInput = z.infer<typeof overridePinSchema>

/** What a cashier types at the counter to get a supervisor's on-the-spot approval. */
export const supervisorPinSchema = z.object({
  username: z.string().trim().min(1, 'Enter the supervisor’s username'),
  pin: z.string().trim().min(1, 'Enter the PIN'),
})
export type SupervisorPinInput = z.infer<typeof supervisorPinSchema>

/** Add/edit user form (wizard step 5 and the Users screen). */
export const userInputSchema = z
  .object({
    name: z.string().trim().min(3, 'Enter the full name'),
    mobile: mobileSchema,
    email: optionalEmail,
    designation: z.string().trim().min(2, 'Enter the job title, e.g. Front Office Executive'),
    roleIds: z.array(z.string()).min(1, 'Give the user at least one role'),
    doctorId: z.string().optional().nullable(),
    active: z.boolean(),
  })
export type UserInput = z.infer<typeof userInputSchema>

/** A row on the users list. */
export interface UserSummary {
  id: string
  name: string
  username: string
  mobile: string
  email?: string
  designation: string
  status: UserStatus
  roles: { id: string; name: string }[]
  doctor: { id: string; name: string } | null
  lastLoginAt?: IsoDateTime
  /** Can type a PIN at the billing counter to approve a discount above the cashier's limit on the spot. */
  hasOverridePin: boolean
}

/** What the login screen shows for each selectable user. */
export interface DemoUser {
  id: string
  name: string
  designation: string
  /** Set for the six demo cards; other users are listed below them. */
  persona?: DemoPersona
  roleNames: string[]
  clinicName: string | null
  status: UserStatus
  inviteToken?: string
  summary: string
}

/** What the app knows about the logged-in user. */
export interface SessionInfo {
  user: Pick<User, 'id' | 'name' | 'username' | 'designation' | 'isSuperAdmin' | 'clinicId' | 'doctorId' | 'tourDoneAt'>
  clinic: (Pick<Clinic, 'id' | 'code' | 'name' | 'city' | 'status' | 'plan'> & { setupComplete: boolean }) | null
  roles: Pick<Role, 'id' | 'name'>[]
  permissions: Permission[]
  /** Set in "See as this user" mode: who is really logged in. `user` is then the previewed user. */
  preview: { realUser: { id: string; name: string } } | null
}

/**
 * What a login-style call returns: either a session was issued directly, or
 * an MFA step must be completed first (added for the pilot security review).
 * `enrollment: true` means this account has never set up TOTP and must do so
 * now (forced for isSuperAdmin and any admin.users.edit role); `false` means
 * TOTP is already enabled and the normal 6-digit-code screen should show.
 * `mfaToken` is short-lived (10 min) and only valid against `/auth/mfa/*`.
 */
export type LoginResult = { token: string } | { mfaRequired: true; enrollment: boolean; mfaToken: string }

export const hasSessionToken = (r: LoginResult): r is { token: string } => 'token' in r

/* ---------- MFA (TOTP) ---------- */

/** Returned by mfa/enroll and mfa/self/enroll: render qrCodeDataUrl as an <img>. */
export interface MfaEnrollmentInfo {
  secret: string
  otpauthUrl: string
  qrCodeDataUrl: string
}

/** mfa/confirm result: the only time recoveryCodes are ever shown — the user must save them now. */
export interface MfaConfirmResult {
  token: string
  recoveryCodes: string[]
}

/** mfa/self/confirm result: no new session (the user already has one). */
export interface MfaSelfConfirmResult {
  recoveryCodes: string[]
}

export interface MfaStatus {
  enabled: boolean
  /** True for isSuperAdmin or any role holding admin.users.edit — self/disable is refused when true. */
  required: boolean
}

export const mfaCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') })
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>

export const mfaRecoveryCodeSchema = z.object({ recoveryCode: z.string().trim().min(1, 'Enter a recovery code') })
export type MfaRecoveryCodeInput = z.infer<typeof mfaRecoveryCodeSchema>

export const mfaDisableSchema = z.object({ password: z.string().min(1, 'Enter your password') })
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>

export interface InviteInfo {
  token: string
  name: string
  email?: string
  clinicName: string
  roleNames: string[]
  expiresAt: IsoDateTime
}

export const acceptInviteSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>

/** Sign-in form: username or the 10-digit mobile number, and the password. */
export const signInSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your username or mobile number'),
  password: z.string().min(1, 'Enter your password'),
})
export type SignInInput = z.infer<typeof signInSchema>

export const resetPasswordSchema = z
  .object({
    identifier: z.string().trim().min(3, 'Enter your username or mobile number'),
    otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export interface ResetRequestResult {
  /** "98XXXXXX45": where the code went. */
  maskedMobile: string
  /** Demo/test only: the live system sends the code by SMS and never returns it. */
  demoOtp?: string
}

export interface AuditEntry {
  id: string
  clinicId: string | null
  at: IsoDateTime
  userId: string
  userName: string
  action: 'create' | 'edit' | 'cancel' | 'deactivate' | 'activate' | 'login' | 'logout' | 'invite' | 'reset' | 'preview' | 'approve' | 'reject'
  entity: string
  entityId?: string
  summary: string
  before?: unknown
  after?: unknown
}

/* ---------- Roles (permission grid) ---------- */

export const roleInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter a role name').max(40, 'Keep the name under 40 characters'),
  description: z.string().trim().max(200).optional().default(''),
  permissions: z.array(z.string()),
  discountLimitPercent: z.number().min(0).max(100).optional(),
})
export type RoleInput = z.input<typeof roleInputSchema>

export interface RoleDetail {
  id: string
  name: string
  description: string
  templateKey?: string
  isSystem: boolean
  active: boolean
  /** Clinic Admin: always has every permission, so the clinic cannot lock itself out. */
  locked: boolean
  permissions: Permission[]
  discountLimitPercent: number
  users: { id: string; name: string; status: UserStatus }[]
}
