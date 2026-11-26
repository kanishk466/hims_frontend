import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { closeDay, decideClosing, getClosing, getDayEnd, getMyCounter, reopenDay, submitClosing } from '@/api/dayEnd'
import type { ClosingInput } from '@/types/dayEnd'

function useDayEndMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of ['dayEnd', 'bills', 'billing', 'visits', 'reports']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
}

export const useMyCounter = (enabled: boolean) => useQuery({ queryKey: ['dayEnd', 'mine'], queryFn: getMyCounter, enabled })
export const useDayEnd = (date: string, enabled: boolean) => useQuery({ queryKey: ['dayEnd', 'day', date], queryFn: () => getDayEnd(date), enabled })
export const useClosing = (id: string | undefined) => useQuery({ queryKey: ['dayEnd', 'closing', id], queryFn: () => getClosing(id!), enabled: !!id })
export const useSubmitClosing = () => useDayEndMutation((input: ClosingInput) => submitClosing(input))
export const useDecideClosing = () => useDayEndMutation(({ id, accept, note }: { id: string; accept: boolean; note?: string }) => decideClosing(id, accept, note))
export const useCloseDay = () => useDayEndMutation((date: string) => closeDay(date))
export const useReopenDay = () => useDayEndMutation(({ date, reason }: { date: string; reason: string }) => reopenDay(date, reason))
