import { Alert, Button, Card, Grid, Group, Loader, Select, Stack, Text } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconArrowLeft, IconFileSpreadsheet, IconPrinter } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ForbiddenPage } from '@/app/pages/ForbiddenPage'
import { isApiError } from '@/api/client'
import type { Permission } from '@/auth/permissions'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { showApiError } from '@/lib/apiErrors'
import { todayIST } from '@/lib/dates'
import { REPORTS, type ReportKey, type ReportQuery, type ReportResult } from '@/types/reports'
import { exportReport } from './excel'
import { formatValue, RANGE_LABELS, RANGES, rangeDates, rangeText, type RangeKey } from './format'
import { useReport, useReportFilters } from './queries'
import { ReportChart } from './ReportChart'
import { ReportTable } from './ReportTable'

const toYmd = (d: Date | string | null) => (d ? (typeof d === 'string' ? d.slice(0, 10) : todayIST(d)) : null)

/** One report: filters in a row on top, headline tiles, the chart, then the table. Filters live in the URL. */
export function ReportViewPage() {
  const { key } = useParams() as { key: ReportKey }
  const info = REPORTS.find((r) => r.key === key)
  const can = useCan(`reports.${key}.view` as Permission)
  if (!info || !can) return <ForbiddenPage />
  return <ReportView key={key} reportKey={key} />
}

function ReportView({ reportKey }: { reportKey: ReportKey }) {
  const info = REPORTS.find((r) => r.key === reportKey)!
  const [params, setParams] = useSearchParams()
  const range = (params.get('range') as RangeKey) || (reportKey === 'collection' || reportKey === 'footfall' ? 'today' : 'last30')
  const q: ReportQuery = {
    ...(range === 'custom' ? { from: params.get('from') ?? todayIST(), to: params.get('to') ?? todayIST() } : rangeDates(range)),
    doctorId: params.get('doctor'),
    departmentId: params.get('dept'),
  }
  const { data: r, error, isFetching } = useReport(reportKey, q)
  const { data: filters } = useReportFilters()
  const canExport = useCan(`reports.${reportKey}.print` as Permission)
  const [exporting, setExporting] = useState(false)
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  const printUrl = `/print/report/${reportKey}?${new URLSearchParams({ from: q.from, to: q.to, ...(q.doctorId ? { doctor: q.doctorId } : {}), ...(q.departmentId ? { dept: q.departmentId } : {}) })}`

  return (
    <Stack gap="md">
      <PageHeader
        title={info.title}
        subtitle={info.description}
        actions={
          <>
            <Button component={Link} to="/reports" variant="subtle" leftSection={<IconArrowLeft size={16} />}>
              All reports
            </Button>
            {canExport && (
              <>
                <Button
                  variant="default"
                  leftSection={<IconFileSpreadsheet size={16} />}
                  disabled={!r}
                  loading={exporting}
                  onClick={async () => {
                    setExporting(true)
                    await exportReport(r!).catch((e) => showApiError(e))
                    setExporting(false)
                  }}
                >
                  Excel
                </Button>
                <Button variant="default" leftSection={<IconPrinter size={16} />} component="a" href={printUrl} target="_blank">
                  Print
                </Button>
              </>
            )}
          </>
        }
      />
      <Card withBorder radius="md" p="sm">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select label="Period" w={170} data={[...RANGES, 'custom'].map((k) => ({ value: k, label: RANGE_LABELS[k as RangeKey] }))} value={range} allowDeselect={false} onChange={(v) => set({ range: v, ...(v === 'custom' ? { from: q.from, to: q.to } : { from: null, to: null }) })} />
          {range === 'custom' && (
            <DatePickerInput
              type="range"
              label="From – to"
              w={260}
              valueFormat="DD MMM YYYY"
              maxDate={todayIST()}
              value={[q.from, q.to]}
              onChange={([a, b]) => a && b && set({ from: toYmd(a), to: toYmd(b) })}
            />
          )}
          <Select
            label="Department"
            w={200}
            clearable
            placeholder="All departments"
            data={(filters?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
            value={q.departmentId ?? null}
            onChange={(v) => set({ dept: v, doctor: null })}
          />
          <Select
            label="Doctor"
            w={220}
            clearable
            searchable
            placeholder="All doctors"
            data={(filters?.doctors ?? []).filter((d) => !q.departmentId || d.departmentId === q.departmentId).map((d) => ({ value: d.id, label: d.name }))}
            value={q.doctorId ?? null}
            onChange={(v) => set({ doctor: v })}
          />
          <Text size="sm" c="dimmed" ml="auto">
            {rangeText(q)} {isFetching && <Loader size="xs" ml={6} />}
          </Text>
        </Group>
      </Card>
      {error && <Alert color="red">{isApiError(error) ? error.message : 'Could not run the report.'}</Alert>}
      {r && <ReportBody r={r} />}
    </Stack>
  )
}

export function ReportBody({ r, forPrint }: { r: ReportResult; forPrint?: boolean }) {
  return (
    <Stack gap="md">
      <Grid>
        {r.tiles.map((t) => (
          <Grid.Col key={t.label} span={{ base: 6, md: 3 }}>
            <Card withBorder radius="md" p="sm" h="100%">
              <Text size="xs" c="dimmed">
                {t.label}
              </Text>
              <Text fw={700} fz={forPrint ? 18 : 24} lh={1.2}>
                {formatValue(t.value, t.format)}
              </Text>
              {t.hint && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {t.hint}
                </Text>
              )}
            </Card>
          </Grid.Col>
        ))}
      </Grid>
      {r.chart && r.chart.data.length > 0 && (
        <Card withBorder radius="md">
          <Text fw={600} mb="xs">
            {r.chartTitle}
          </Text>
          <ReportChart chart={r.chart} h={forPrint ? 200 : 260} />
        </Card>
      )}
      <Card withBorder radius="md" p={0}>
        <ReportTable r={r} maxHeight={forPrint ? undefined : 520} />
      </Card>
      {r.note && (
        <Text size="xs" c="dimmed">
          {r.note}
        </Text>
      )}
    </Stack>
  )
}
