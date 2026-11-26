import { ScrollArea, Table, Text } from '@mantine/core'
import type { ReportResult } from '@/types/reports'
import { formatValue } from './format'

const right = (f: string) => f !== 'text' && f !== 'date'

/** The table view of a report (always present: it is how the numbers are checked and exported). */
export function ReportTable({ r, maxHeight }: { r: ReportResult; maxHeight?: number }) {
  const table = (
    <Table striped highlightOnHover stickyHeader={!!maxHeight} verticalSpacing={6} fz="sm">
      <Table.Thead>
        <Table.Tr>
          {r.columns.map((c) => (
            <Table.Th key={c.key} ta={right(c.format) ? 'right' : undefined} style={{ whiteSpace: 'nowrap' }}>
              {c.label}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {r.rows.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={r.columns.length}>
              <Text c="dimmed" ta="center" py="md" size="sm">
                Nothing in this period.
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
        {r.rows.map((row, i) => (
          <Table.Tr key={i}>
            {r.columns.map((c) => (
              <Table.Td key={c.key} ta={right(c.format) ? 'right' : undefined} style={{ whiteSpace: c.format === 'text' ? undefined : 'nowrap' }}>
                {formatValue(row[c.key], c.format)}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
      {r.totals && r.rows.length > 0 && (
        <Table.Tfoot>
          <Table.Tr>
            {r.columns.map((c) => (
              <Table.Th key={c.key} ta={right(c.format) ? 'right' : undefined} style={{ whiteSpace: 'nowrap' }}>
                {formatValue(r.totals![c.key], c.format)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Tfoot>
      )}
    </Table>
  )
  return maxHeight ? <ScrollArea.Autosize mah={maxHeight}>{table}</ScrollArea.Autosize> : table
}
