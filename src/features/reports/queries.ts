import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getMdDashboard, getReportFilters, runReport } from '@/api/reports'
import type { ReportKey, ReportQuery } from '@/types/reports'

export const useReport = (key: ReportKey, q: ReportQuery) => useQuery({ queryKey: ['reports', key, q], queryFn: () => runReport(key, q), placeholderData: keepPreviousData })
export const useReportFilters = () => useQuery({ queryKey: ['reports', 'filters'], queryFn: getReportFilters, staleTime: 5 * 60_000 })
export const useMdDashboard = (enabled: boolean) => useQuery({ queryKey: ['reports', 'md'], queryFn: getMdDashboard, enabled, refetchInterval: 30_000 })
