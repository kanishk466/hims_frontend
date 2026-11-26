import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClinic, listClinics, resendAdminInvite, updateClinic } from '@/api/platform'
import type { UpdateClinicInput } from '@/types/clinic'

export const useClinics = () => useQuery({ queryKey: ['clinics'], queryFn: listClinics })

function useRefresh() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['clinics'] })
    qc.invalidateQueries({ queryKey: ['demoUsers'] })
  }
}

export function useCreateClinic() {
  return useMutation({ mutationFn: createClinic, onSuccess: useRefresh() })
}

export function useUpdateClinic() {
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateClinicInput }) => updateClinic(id, input), onSuccess: useRefresh() })
}

export function useResendAdminInvite() {
  return useMutation({ mutationFn: resendAdminInvite, onSuccess: useRefresh() })
}
