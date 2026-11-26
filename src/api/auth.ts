import type { DemoUser, InviteInfo, LoginResult, MfaConfirmResult, MfaEnrollmentInfo, MfaSelfConfirmResult, MfaStatus, SessionInfo, AcceptInviteInput, ResetPasswordInput, ResetRequestResult, SignInInput } from '@/types/auth'
import { request } from './client'

/** Users shown on the demo login screen: the six demo cards first, then everyone else. Public. */
export function listDemoUsers(): Promise<DemoUser[]> {
  return request('/auth/demo-users')
}

/** Demo login: pick a user, no password (the demo picker at /login/demo). */
export function login(userId: string): Promise<LoginResult> {
  return request('/auth/login', { method: 'POST', body: { userId } })
}

export function loginWithPassword(input: SignInInput): Promise<LoginResult> {
  return request('/auth/login-password', { method: 'POST', body: input })
}

/** Public: send a 6-digit code to the user's mobile (shown on screen in the demo/test backend). */
export function requestPasswordReset(identifier: string): Promise<ResetRequestResult> {
  return request('/auth/request-reset', { method: 'POST', body: { identifier } })
}

/** Public: check the code, set the new password, and sign in. */
export function resetPassword(input: ResetPasswordInput): Promise<LoginResult> {
  return request('/auth/reset-password', { method: 'POST', body: input })
}

export function getSession(): Promise<SessionInfo> {
  return request('/auth/session')
}

/* ---------- MFA (TOTP) ---------- */
// Login-time flow (no session yet — identity is proven by the mfaToken a login call returned).

/** First-time setup. Safe to call again for the same mfaToken (replaces any previous pending secret). */
export function mfaEnroll(mfaToken: string): Promise<MfaEnrollmentInfo> {
  return request('/auth/mfa/enroll', { method: 'POST', body: { mfaToken } })
}

/** Confirms the enrollment code and issues the session in the same call. recoveryCodes shown once. */
export function mfaConfirm(mfaToken: string, code: string): Promise<MfaConfirmResult> {
  return request('/auth/mfa/confirm', { method: 'POST', body: { mfaToken, code } })
}

/** The normal every-login step once TOTP is already enabled. */
export function mfaVerify(mfaToken: string, code: string): Promise<{ token: string }> {
  return request('/auth/mfa/verify', { method: 'POST', body: { mfaToken, code } })
}

/** Same as mfaVerify, but with a one-time recovery code for a lost/replaced device. */
export function mfaRecover(mfaToken: string, recoveryCode: string): Promise<{ token: string }> {
  return request('/auth/mfa/recover', { method: 'POST', body: { mfaToken, recoveryCode } })
}

// Self-service flow — for an already-signed-in user turning TOTP on or off voluntarily.

export function getMfaStatus(): Promise<MfaStatus> {
  return request('/auth/mfa')
}

export function mfaSelfEnroll(): Promise<MfaEnrollmentInfo> {
  return request('/auth/mfa/self/enroll', { method: 'POST' })
}

export function mfaSelfConfirm(code: string): Promise<MfaSelfConfirmResult> {
  return request('/auth/mfa/self/confirm', { method: 'POST', body: { code } })
}

/** Refused (400 mfa_required_for_role) when MFA is mandatory for this account. */
export function mfaSelfDisable(password: string): Promise<void> {
  return request('/auth/mfa/self/disable', { method: 'POST', body: { password } })
}

export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST' })
}

/* ---------- Invites ---------- */

/** Public: details shown on the invite page. */
export function getInvite(token: string): Promise<InviteInfo> {
  return request(`/auth/invite/${encodeURIComponent(token)}`)
}

/**
 * Public: accept the invite and sign in.
 */
export function acceptInvite(token: string, input: AcceptInviteInput): Promise<LoginResult> {
  return request('/auth/accept-invite', { method: 'POST', body: { token, ...input } })
}

/* ---------- "See as this user" ---------- */

/**
 * Check that the admin may preview the user, and audit it. The client then
 * sends the user id with every request (setViewAs) until preview ends.
 */
export function startPreview(userId: string): Promise<{ name: string }> {
  return request('/auth/start-preview', { method: 'POST', body: { userId } })
}
