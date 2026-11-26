import type { ReportResult } from '@/types/reports'
import { rangeText } from './format'

/** Download the report table as .xlsx: money in rupees with two decimals, rates and minutes as numbers. */
export async function exportReport(r: ReportResult) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const cell = (v: string | number | null | undefined, f: string) => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'number') return f === 'inr' ? { value: v / 100, type: Number, format: '#,##0.00' } : { value: v, type: Number }
    return { value: v, type: String }
  }
  const header = r.columns.map((c) => ({ value: c.label + (c.format === 'inr' ? ' (₹)' : c.format === 'pct' ? ' (%)' : c.format === 'min' ? ' (min)' : ''), fontWeight: 'bold' as const }))
  const rows = r.rows.map((row) => r.columns.map((c) => cell(row[c.key], c.format)))
  const totals = r.totals ? [r.columns.map((c) => ({ ...(cell(r.totals![c.key], c.format) ?? { value: '' }), fontWeight: 'bold' as const }))] : []
  const intro = [[{ value: `${r.clinicName} · ${r.title}`, fontWeight: 'bold' as const }], [{ value: rangeText(r.query) }], []]
  await writeXlsxFile([...intro, header, ...rows, ...totals] as never, { sheet: r.title.slice(0, 30), columns: r.columns.map((c) => ({ width: c.format === 'text' ? 24 : 14 })) }).toFile(`${r.key}_${r.query.from}_${r.query.to}.xlsx`)
}
