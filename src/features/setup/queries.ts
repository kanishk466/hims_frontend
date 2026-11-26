import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getIntegrationSettings, updateIntegrationSettings } from '@/api/integrations'
import { getMessageTemplates, updateMessageTemplates } from '@/api/messages'
import { getPrintSettings, updatePrintSettings } from '@/api/print'
import { completeSetup, getClinicProfile, getSetupProgress, markServicesReviewed, updateClinicProfile } from '@/api/setup'
import type { IntegrationSettings, MessageTemplates, PrintSettings } from '@/types/clinic'

export const useSetupProgress = (enabled = true) => useQuery({ queryKey: ['setupProgress'], queryFn: getSetupProgress, enabled })
export const useClinicProfile = () => useQuery({ queryKey: ['clinicProfile'], queryFn: getClinicProfile })
export const usePrintSettings = () => useQuery({ queryKey: ['printSettings'], queryFn: getPrintSettings })
export const useIntegrationSettings = () => useQuery({ queryKey: ['integrationSettings'], queryFn: getIntegrationSettings })

export function useUpdatePrintSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PrintSettings) => updatePrintSettings(input),
    onSuccess: () => {
      for (const k of ['printSettings', 'setupProgress']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
}

export function useUpdateIntegrationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: IntegrationSettings) => updateIntegrationSettings(input),
    onSuccess: () => {
      for (const k of ['integrationSettings', 'setupProgress']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
}

export function useUpdateClinicProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateClinicProfile,
    onSuccess: (clinic) => {
      qc.setQueryData(['clinicProfile'], clinic)
      for (const k of ['setupProgress', 'session']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
}

export const useMessageTemplates = () => useQuery({ queryKey: ['messageTemplates'], queryFn: getMessageTemplates })

export function useUpdateMessageTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MessageTemplates) => updateMessageTemplates(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messageTemplates'] }),
  })
}

export function useMarkServicesReviewed() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: markServicesReviewed, onSuccess: () => qc.invalidateQueries({ queryKey: ['setupProgress'] }) })
}

export function useCompleteSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: completeSetup,
    onSuccess: () => {
      for (const k of ['setupProgress', 'session', 'clinicProfile']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
}
