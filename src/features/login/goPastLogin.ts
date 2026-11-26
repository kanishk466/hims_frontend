import type { NavigateFunction } from 'react-router-dom'
import type { LoginResult } from '@/types/auth'
import { hasSessionToken } from '@/types/auth'

/**
 * Shared by every screen that can end with a LoginResult (password login, demo login,
 * password reset, accept-invite): if a session was issued, go to `from`; if an MFA step is
 * required instead, go to /login/mfa carrying what it needs in router state.
 */
export function goPastLogin(navigate: NavigateFunction, result: LoginResult, from: string) {
  if (hasSessionToken(result)) {
    navigate(from, { replace: true })
    return
  }
  navigate('/login/mfa', { replace: true, state: { mfaToken: result.mfaToken, enrollment: result.enrollment, from } })
}
