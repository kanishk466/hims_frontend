import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRole, listRoleDetails, setRoleActive, updateRole } from '@/api/roles'
import type { RoleInput } from '@/types/auth'

export const useRoleDetails = () => useQuery({ queryKey: ['roleDetails'], queryFn: listRoleDetails })

function useRefresh() {
  const qc = useQueryClient()
  return () => {
    // Session too: if admins edit their own role, menus update at once.
    for (const k of ['roleDetails', 'roles', 'users', 'session']) qc.invalidateQueries({ queryKey: [k] })
  }
}

export function useCreateRole() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: ({ input, copyFromId }: { input: RoleInput; copyFromId?: string }) => createRole(input, copyFromId), onSuccess: refresh })
}

export function useUpdateRole() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: RoleInput }) => updateRole(id, input), onSuccess: refresh })
}

export function useSetRoleActive() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setRoleActive(id, active), onSuccess: refresh })
}
