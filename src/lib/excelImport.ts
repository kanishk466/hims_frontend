/**
 * Generic Excel import for masters (doctors, services, drugs): a template to fill in,
 * read back by column header (not position), rows normalised to strings for the
 * caller's own Zod schema to validate — the same validation the manual forms use.
 */
export interface ImportColumn {
  key: string
  header: string
  /** Shown in the downloadable template's example row. */
  example: string
}

export interface ImportRow {
  /** 1-indexed spreadsheet row, for messages ("row 5: ..."). */
  row: number
  values: Record<string, string>
}

/** Download a template: header row + one example row, both from `columns`. */
export async function downloadImportTemplate(filename: string, columns: ImportColumn[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const header = columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }))
  const example = columns.map((c) => ({ value: c.example, color: '#888888' }))
  await writeXlsxFile([header, example] as never, { columns: columns.map(() => ({ width: 22 })) }).toFile(filename)
}

/** Read an uploaded .xlsx by column header (case-insensitive); blank rows are skipped. */
export async function readImportRows(file: File, columns: ImportColumn[]): Promise<ImportRow[]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const sheet = (await readXlsxFile(file)) as unknown as unknown[][]
  if (!sheet.length) return []
  const header = sheet[0]!.map((h) => String(h ?? '').trim().toLowerCase())
  const indexOf = (h: string) => header.indexOf(h.trim().toLowerCase())
  const colIndex = columns.map((c) => indexOf(c.header))
  return sheet
    .slice(1)
    .map((cells, i) => ({ row: i + 2, cells }))
    .filter(({ cells }) => cells.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
    .map(({ row, cells }) => ({
      row,
      values: Object.fromEntries(columns.map((c, i) => [c.key, colIndex[i]! >= 0 ? String(cells[colIndex[i]!] ?? '').trim() : ''])),
    }))
}

/** "Yes"/"Y"/"true"/"1" (any case) → true; everything else, including blank → false. */
export function parseImportBool(s: string): boolean {
  return ['yes', 'y', 'true', '1'].includes(s.trim().toLowerCase())
}

/** Match free text against a value or its label, case-insensitively; '' if nothing matches. */
export function matchImportOption(text: string, options: { value: string; label: string }[]): string {
  const t = text.trim().toLowerCase()
  if (!t) return ''
  return options.find((o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t)?.value ?? ''
}
