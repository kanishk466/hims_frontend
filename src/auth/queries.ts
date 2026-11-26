import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getMfaStatus, getSession, listDemoUsers, login, loginWithPassword, logout, mfaConfirm, mfaEnroll, mfaRecover, mfaSelfConfirm, mfaSelfDisable, mfaSelfEnroll, mfaVerify, requestPasswordReset, resetPassword, startPreview } from '@/api/auth'
import { isApiError } from '@/api/client'
import type { LoginResult } from '@/types/auth'
import { hasSessionToken } from '@/types/auth'
import { useSessionStore } from './sessionStore'

export const authKeys = {
  session: (token: string | null, viewAs: string | null = null) => ['session', token, viewAs] as const,
  demoUsers: ['demoUsers'] as const,
}

export function useDemoUsers() {
  return useQuery({ queryKey: authKeys.demoUsers, queryFn: listDemoUsers })
}

/** The logged-in user, clinic, roles and permissions. */
export function useSession() {
  const token = useSessionStore((s) => s.token)
  const viewAs = useSessionStore((s) => s.viewAsUserId)
  const clear = useSessionStore((s) => s.clear)
  const setViewAsUser = useSessionStore((s) => s.setViewAsUser)
  const query = useQuery({
    queryKey: authKeys.session(token, viewAs),
    queryFn: getSession,
    enabled: !!token,
    // Role changes reach a logged-in user on their next action: no logout needed.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  useEffect(() => {
    if (!isApiError(query.error)) return
    if (query.error.status === 401) clear()
    else if (query.error.code === 'preview_not_allowed') setViewAsUser(null)
  }, [query.error, clear, setViewAsUser])
  return { ...query, token }
}

/**
 * Any mutation that returns a LoginResult: when a session was issued directly, clear the
 * previous user's cached data and store the token. When an MFA step is required instead, do
 * nothing here — the screen reads `mfaRequired`/`enrollment`/`mfaToken` off the result itself
 * and navigates to /login/mfa.
 */
function useLoginResultMutation<I>(fn: (input: I) => Promise<LoginResult>) {
  const setToken = useSessionStore((s) => s.setToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      if (hasSessionToken(result)) {
        qc.removeQueries()
        setToken(result.token)
      }
    },
  })
}

export const useLogin = () => useLoginResultMutation(login)
export const usePasswordLogin = () => useLoginResultMutation(loginWithPassword)
export const useResetPassword = () => useLoginResultMutation(resetPassword)
export const useRequestPasswordReset = () => useMutation({ mutationFn: requestPasswordReset })

/* ---------- MFA (TOTP) ---------- */

/** Login-time: first-time setup. */
export const useMfaEnroll = () => useMutation({ mutationFn: mfaEnroll })

/** Login-time: confirms the enrollment code and issues the session. */
export function useMfaConfirm() {
  const setToken = useSessionStore((s) => s.setToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ mfaToken, code }: { mfaToken: string; code: string }) => mfaConfirm(mfaToken, code),
    onSuccess: ({ token }) => {
      qc.removeQueries()
      setToken(token)
    },
  })
}

/** Login-time: the every-login step once TOTP is already enabled. */
export function useMfaVerify() {
  const setToken = useSessionStore((s) => s.setToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ mfaToken, code }: { mfaToken: string; code: string }) => mfaVerify(mfaToken, code),
    onSuccess: ({ token }) => {
      qc.removeQueries()
      setToken(token)
    },
  })
}

/** Login-time: a one-time recovery code instead of a live TOTP code. */
export function useMfaRecover() {
  const setToken = useSessionStore((s) => s.setToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ mfaToken, recoveryCode }: { mfaToken: string; recoveryCode: string }) => mfaRecover(mfaToken, recoveryCode),
    onSuccess: ({ token }) => {
      qc.removeQueries()
      setToken(token)
    },
  })
}

export const mfaStatusKey = ['mfaStatus'] as const

/** Self-service: whether the signed-in user has TOTP enabled, and whether their role requires it. */
export function useMfaStatus() {
  const token = useSessionStore((s) => s.token)
  return useQuery({ queryKey: mfaStatusKey, queryFn: getMfaStatus, enabled: !!token })
}

/** Self-service: starts (or restarts) voluntary enrollment for the signed-in user. */
export const useMfaSelfEnroll = () => useMutation({ mutationFn: mfaSelfEnroll })

/** Self-service: confirms the code and activates TOTP — no new session (the user already has one). */
export function useMfaSelfConfirm() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: mfaSelfConfirm, onSuccess: () => qc.invalidateQueries({ queryKey: mfaStatusKey }) })
}

/** Self-service: refused outright (400 mfa_required_for_role) when MFA is mandatory for this account. */
export function useMfaSelfDisable() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: mfaSelfDisable, onSuccess: () => qc.invalidateQueries({ queryKey: mfaStatusKey }) })
}

export function useLogout() {
  const clear = useSessionStore((s) => s.clear)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      clear()
      qc.removeQueries()
    },
  })
}

/** "See as this user": checked and audited by the API, then every request carries the user id. */
export function useStartPreview() {
  const setViewAsUser = useSessionStore((s) => s.setViewAsUser)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      await startPreview(userId)
      return userId
    },
    onSuccess: (userId) => {
      qc.removeQueries()
      setViewAsUser(userId)
    },
  })
}

export function useStopPreview() {
  const setViewAsUser = useSessionStore((s) => s.setViewAsUser)
  const qc = useQueryClient()
  return () => {
    qc.removeQueries()
    setViewAsUser(null)
  }
}
