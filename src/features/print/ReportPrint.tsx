import { useParams, useSearchParams } from 'react-router-dom'
import { ForbiddenPage } from '@/app/pages/ForbiddenPage'
import { isApiError } from '@/api/client'
import type { Permission } from '@/auth/permissions'
import { useCan } from '@/auth/useCan'
import { formatDateTime, todayIST } from '@/lib/dates'
import type { ReportKey } from '@/types/reports'
import { rangeText } from '../reports/format'
import { useReport, useReportFilters } from '../reports/queries'
import { ReportBody } from '../reports/ReportViewPage'
import { Letterhead } from './Letterhead'
import { PrintSheet } from './PrintLayout'
import { useLetterhead } from './queries'

/** A4 print of any report with the filters it was run with. */
export function ReportPrint() {
  const { key } = useParams() as { key: ReportKey }
  const can = useCan(`reports.${key}.print` as Permission)
  if (!can) return <ForbiddenPage />
  return <Body reportKey={key} />
}

function Body({ reportKey }: { reportKey: ReportKey }) {
  const [p] = useSearchParams()
  const q = { from: p.get('from') ?? todayIST(), to: p.get('to') ?? todayIST(), doctorId: p.get('doctor'), departmentId: p.get('dept') }
  const { data: r, error } = useReport(reportKey, q)
  const { data: lh } = useLetterhead()
  const { data: f } = useReportFilters()
  const filters = [f?.departments.find((d) => d.id === q.departmentId)?.name, f?.doctors.find((d) => d.id === q.doctorId)?.name].filter(Boolean).join(' · ')
  return (
    <PrintSheet title={r?.title ?? 'Report'} size="a4" ready={!!(r && lh)} error={isApiError(error) ? error.message : undefined}>
      {r && lh && (
        <>
          <Letterhead c={lh} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>{r.title}</div>
          <div className="muted" style={{ marginBottom: 8 }}>
            {rangeText(r.query)}
            {filters ? ` · ${filters}` : ''} · printed {formatDateTime(r.generatedAt)}
          </div>
          <ReportBody r={r} forPrint />
        </>
      )}
    </PrintSheet>
  )
}
