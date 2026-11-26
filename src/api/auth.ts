import type { DemoUser, InviteInfo, LoginResult, SessionInfo, AcceptInviteInput, ResetPasswordInput, ResetRequestResult, SignInInput } from '@/types/auth'
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
