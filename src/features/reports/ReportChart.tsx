import { BarChart, LineChart } from '@mantine/charts'
import type { ReportChart as Chart } from '@/types/reports'
import { formatValue } from './format'

/**
 * One chart per report: thin bars with a gap, rounded data ends, recessive grid, a legend for
 * two or more series and a hover tooltip. Money is formatted from paise.
 */
export function ReportChart({ chart, h = 260 }: { chart: Chart; h?: number }) {
  const fmt = (v: number) => formatValue(v, chart.format)
  const axisFmt = (v: number) => (chart.format === 'inr' ? `₹${Math.round(v / 100).toLocaleString('en-IN')}` : chart.format === 'pct' ? `${v}%` : String(v))
  const many = chart.series.length > 1
  const common = {
    h,
    data: chart.data,
    dataKey: chart.dataKey,
    series: chart.series,
    valueFormatter: fmt,
    withLegend: many,
    legendProps: { verticalAlign: 'top' as const, height: 36 },
    gridAxis: 'y' as const,
    strokeDasharray: '2 4',
    yAxisProps: { tickFormatter: axisFmt, width: chart.format === 'inr' ? 80 : 44 },
    xAxisProps: { interval: 'preserveStartEnd' as const, minTickGap: 12 },
    tooltipAnimationDuration: 120,
  }
  if (chart.kind === 'line') return <LineChart {...common} curveType="monotone" strokeWidth={2} dotProps={{ r: 4 }} />
  return <BarChart {...common} type={chart.kind === 'stacked' ? 'stacked' : 'default'} barProps={{ radius: chart.kind === 'stacked' ? 0 : [4, 4, 0, 0] }} maxBarWidth={28} />
}
