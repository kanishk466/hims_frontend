import { Alert, Badge, Button, FileButton, Group, Loader, Modal, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { IconDownload, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { isApiError } from '@/api/client'
import { downloadImportTemplate, readImportRows, type ImportColumn, type ImportRow } from '@/lib/excelImport'

type Validated<TInput> = { row: number; values: Record<string, string>; input?: TInput; error?: string }
type RowResult = 'pending' | 'importing' | 'done' | 'failed'

/**
 * Generic "import from Excel" flow for a masters list: download a template, upload it back,
 * see which rows are valid, import the valid ones one by one (each goes through the same
 * create endpoint and validation as the manual form, so duplicates and bad references are
 * still caught — just per row instead of stopping the whole import).
 */
export function ExcelImportModal<TInput>({
  opened,
  onClose,
  title,
  columns,
  templateFilename,
  toInput,
  importRow,
}: {
  opened: boolean
  onClose: () => void
  title: string
  columns: ImportColumn[]
  templateFilename: string
  /** Build the create-input from a row's string values, or an error to show instead. */
  toInput: (values: Record<string, string>) => { input: TInput } | { error: string }
  /** Create one record. A thrown ApiError's message is shown for that row. */
  importRow: (input: TInput) => Promise<unknown>
}) {
  const [rows, setRows] = useState<Validated<TInput>[] | null>(null)
  const [results, setResults] = useState<Record<number, { status: RowResult; message?: string }>>({})
  const [importing, setImporting] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const close = () => {
    onClose()
    setRows(null)
    setResults({})
    setParseError(null)
  }

  const pick = async (file: File | null) => {
    if (!file) return
    setParseError(null)
    setResults({})
    try {
      const read: ImportRow[] = await readImportRows(file, columns)
      setRows(
        read.map((r) => {
          const out = toInput(r.values)
          return 'input' in out ? { row: r.row, values: r.values, input: out.input } : { row: r.row, values: r.values, error: out.error }
        }),
      )
    } catch {
      setParseError('Could not read that file. Use the downloaded template without changing its columns.')
    }
  }

  const validRows = (rows ?? []).filter((r) => r.input)
  const importAll = async () => {
    setImporting(true)
    for (const r of validRows) {
      setResults((x) => ({ ...x, [r.row]: { status: 'importing' } }))
      try {
        await importRow(r.input!)
        setResults((x) => ({ ...x, [r.row]: { status: 'done' } }))
      } catch (e) {
        setResults((x) => ({ ...x, [r.row]: { status: 'failed', message: isApiError(e) ? e.message : 'Could not save this row.' } }))
      }
    }
    setImporting(false)
  }

  const imported = Object.values(results).filter((r) => r.status === 'done').length
  const failed = Object.values(results).filter((r) => r.status === 'failed').length
  const finished = rows && validRows.length > 0 && imported + failed === validRows.length

  return (
    <Modal opened={opened} onClose={close} title={title} size="lg">
      <Stack>
        {!rows && (
          <>
            <Text size="sm" c="dimmed">
              Download the template, fill in one row per record, then upload it back. Columns are matched by name, so keep the header row as is.
            </Text>
            <Group>
              <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => downloadImportTemplate(templateFilename, columns)}>
                Download template
              </Button>
              <FileButton onChange={pick} accept=".xlsx">
                {(props) => (
                  <Button leftSection={<IconUpload size={16} />} {...props}>
                    Upload filled-in file
                  </Button>
                )}
              </FileButton>
            </Group>
            {parseError && <Alert color="red">{parseError}</Alert>}
          </>
        )}

        {rows && (
          <>
            <Group justify="space-between">
              <Text size="sm">
                {rows.length} row{rows.length === 1 ? '' : 's'} found · {validRows.length} ready to import{rows.length - validRows.length ? `, ${rows.length - validRows.length} with errors` : ''}
              </Text>
              {!importing && !finished && (
                <Button size="xs" variant="subtle" onClick={() => setRows(null)}>
                  Choose a different file
                </Button>
              )}
            </Group>
            <ScrollArea.Autosize mah={320}>
              <Table verticalSpacing={4} fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={50}>Row</Table.Th>
                    <Table.Th>{columns[0]?.header}</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((r) => {
                    const res = results[r.row]
                    return (
                      <Table.Tr key={r.row}>
                        <Table.Td>{r.row}</Table.Td>
                        <Table.Td>{r.values[columns[0]!.key]}</Table.Td>
                        <Table.Td>
                          {res?.status === 'importing' ? (
                            <Loader size={14} />
                          ) : res?.status === 'done' ? (
                            <Badge size="sm" color="teal" variant="light">
                              Imported
                            </Badge>
                          ) : res?.status === 'failed' ? (
                            <Text size="xs" c="red">
                              {res.message}
                            </Text>
                          ) : r.error ? (
                            <Text size="xs" c="red">
                              {r.error}
                            </Text>
                          ) : (
                            <Badge size="sm" color="gray" variant="light">
                              Ready
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
            {finished ? (
              <Alert color={failed ? 'yellow' : 'teal'}>
                Imported {imported} of {validRows.length}
                {failed ? `, ${failed} failed (see above)` : ''}.
              </Alert>
            ) : (
              <Group justify="flex-end">
                <Button variant="default" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={importAll} loading={importing} disabled={validRows.length === 0}>
                  Import {validRows.length} row{validRows.length === 1 ? '' : 's'}
                </Button>
              </Group>
            )}
            {finished && (
              <Group justify="flex-end">
                <Button onClick={close}>Done</Button>
              </Group>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}
