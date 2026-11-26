import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, listRoles, listUsers, resendUserInvite, setOverridePin, updateUser } from '@/api/users'
import type { OverridePinInput, UserInput } from '@/types/auth'

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: listUsers })
export const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: listRoles, staleTime: 60_000 })

export function useSaveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: UserInput }) => (id ? updateUser(id, input) : createUser(input)),
    onSuccess: () => {
      for (const k of ['users', 'doctors', 'setupProgress', 'session', 'demoUsers']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
}

export function useResendInvite() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: resendUserInvite, onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
}

export function useSetOverridePin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OverridePinInput }) => setOverridePin(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}
