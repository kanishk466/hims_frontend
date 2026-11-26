/**
 * OPD reports and the MD dashboard. The real backend runs the same queries in SQL;
 * screens only render the ReportResult this returns.
 */
import type { MdDashboard, ReportKey, ReportQuery, ReportResult } from '@/types/reports'
import { request } from './client'

function queryString(q: ReportQuery): string {
  const params = new URLSearchParams({ from: q.from, to: q.to })
  if (q.doctorId) params.set('doctorId', q.doctorId)
  if (q.departmentId) params.set('departmentId', q.departmentId)
  return params.toString()
}

export function runReport(key: ReportKey, q: ReportQuery): Promise<ReportResult> {
  return request(`/reports/${key}?${queryString(q)}`)
}

/** MD dashboard: today's numbers, the doctor line-up, and the 30-day trend. */
export function getMdDashboard(): Promise<MdDashboard> {
  return request('/reports/md-dashboard')
}

/** Doctor and department lists for the report filters (report users may not see the masters). */
export function getReportFilters(): Promise<{ doctors: { id: string; name: string; departmentId: string }[]; departments: { id: string; name: string }[] }> {
  return request('/reports/filters')
}
