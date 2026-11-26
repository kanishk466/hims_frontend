import dayjs from 'dayjs'
import { addDays, formatDay, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import type { ReportQuery, ValueFormat } from '@/types/reports'

/** Report values: money is paise, rates are percentages, waits are minutes. */
export function formatValue(v: string | number | null | undefined, f: ValueFormat): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'string') return f === 'date' ? formatDay(v) : v
  switch (f) {
    case 'inr':
      return formatINR(v)
    case 'pct':
      return `${v}%`
    case 'min':
      return `${v} min`
    case 'int':
      return v.toLocaleString('en-IN')
    default:
      return String(v)
  }
}

export const RANGES = ['today', 'yesterday', 'thisWeek', 'last7', 'thisMonth', 'lastMonth', 'last30', 'last90'] as const
export type RangeKey = (typeof RANGES)[number] | 'custom'
export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  last7: 'Last 7 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  custom: 'Custom',
}

export function rangeDates(k: Exclude<RangeKey, 'custom'>, today = todayIST()): Pick<ReportQuery, 'from' | 'to'> {
  const t = dayjs(today)
  switch (k) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'thisWeek': // Monday start
      return { from: t.subtract((t.day() + 6) % 7, 'day').format('YYYY-MM-DD'), to: today }
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'thisMonth':
      return { from: t.startOf('month').format('YYYY-MM-DD'), to: today }
    case 'lastMonth':
      return { from: t.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), to: t.subtract(1, 'month').endOf('month').format('YYYY-MM-DD') }
    case 'last30':
      return { from: addDays(today, -29), to: today }
    case 'last90':
      return { from: addDays(today, -89), to: today }
  }
}

export const rangeText = (q: Pick<ReportQuery, 'from' | 'to'>) => (q.from === q.to ? formatDay(q.from) : `${formatDay(q.from)} – ${formatDay(q.to)}`)
