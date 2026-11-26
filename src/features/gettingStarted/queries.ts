import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getGettingStarted, markRolesReviewed, setGettingStartedHidden } from '@/api/gettingStarted'

export const useGettingStarted = (enabled: boolean) => useQuery({ queryKey: ['gettingStarted'], queryFn: getGettingStarted, enabled })

function useUpdate<I>(fn: (input: I) => ReturnType<typeof getGettingStarted>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (data) => qc.setQueryData(['gettingStarted'], data) })
}
export const useMarkRolesReviewed = () => useUpdate<void>(() => markRolesReviewed())
export const useHideGettingStarted = () => useUpdate<boolean>((hidden) => setGettingStartedHidden(hidden))

/** From the user menu: bring the card back on the dashboard. */
export function useShowGettingStarted() {
  const m = useHideGettingStarted()
  return () => m.mutateAsync(false).catch(() => undefined)
}
