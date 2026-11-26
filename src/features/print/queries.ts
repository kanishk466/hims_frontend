import { useQuery } from '@tanstack/react-query'
import { getLetterhead } from '@/api/print'

export const useLetterhead = () =>
  useQuery({
    queryKey: ['letterhead'],
    queryFn: getLetterhead,
    staleTime: 5 * 60_000,
  })
