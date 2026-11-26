import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getSession, listDemoUsers, login, loginWithPassword, logout, requestPasswordReset, resetPassword, startPreview } from '@/api/auth'
import { isApiError } from '@/api/client'
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

export function useLogin() {
  const setToken = useSessionStore((s) => s.setToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: ({ token }) => {
      qc.removeQueries()
      setToken(token)
    },
  })
}

/** Any mutation that returns a session token: clears cached data of the previous user, then stores it. */
function useTokenMutation<I>(fn: (input: I) => Promise<{ token: string }>) {
  const setToken = useSessionStore((s) => s.setToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ token }) => {
      qc.removeQueries()
      setToken(token)
    },
  })
}

export const usePasswordLogin = () => useTokenMutation(loginWithPassword)
export const useResetPassword = () => useTokenMutation(resetPassword)
export const useRequestPasswordReset = () => useMutation({ mutationFn: requestPasswordReset })

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
