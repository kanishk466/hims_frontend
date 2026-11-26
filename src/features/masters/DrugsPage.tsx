import { zodResolver } from '@hookform/resolvers/zod'
import { ActionIcon, Autocomplete, Badge, Button, Card, Grid, Group, Menu, Modal, Pagination, Select, Stack, Switch, Table, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconAlertTriangle, IconDots, IconFileSpreadsheet, IconPencil, IconPlus, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { confirmDeactivate } from '@/components/confirmDeactivate'
import { ExcelImportModal } from '@/components/ExcelImportModal'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { matchImportOption, parseImportBool, type ImportColumn } from '@/lib/excelImport'
import { DRUG_SCHEDULE_LABELS, DRUG_SCHEDULES, drugInputSchema, type Drug, type DrugInput } from '@/types/masters'
import type { ValueListItem } from '@/types/valueLists'
import { useDrugs, useGenerics, useSaveDrug, useSetDrugActive, useValueList } from './queries'

const SCHEDULE_COLORS: Record<string, string> = { none: 'gray', H: 'blue', H1: 'orange', X: 'red' }

const DRUG_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'brand', header: 'Brand', example: 'Dolo' },
  { key: 'generic', header: 'Generic (salt)', example: 'Paracetamol' },
  { key: 'strength', header: 'Strength', example: '650 mg' },
  { key: 'form', header: 'Form', example: 'Tablet' },
  { key: 'manufacturer', header: 'Manufacturer (optional)', example: 'Micro Labs' },
  { key: 'drugClass', header: 'Class (optional)', example: 'Analgesic' },
  { key: 'schedule', header: 'Schedule (none/H/H1/X)', example: 'none' },
  { key: 'highAlert', header: 'High-alert (Yes/No)', example: 'No' },
]

/** Build a drug create-input from one imported row's text, or an error for that row. */
function drugRowToInput(values: Record<string, string>, forms: ValueListItem[]): { input: DrugInput } | { error: string } {
  const form = matchImportOption(
    values.form ?? '',
    forms.map((f) => ({ value: f.code, label: f.label })),
  )
  if (!form) return { error: `Unknown dosage form "${values.form}"` }
  const schedule = matchImportOption(
    values.schedule ?? 'none',
    DRUG_SCHEDULES.map((s) => ({ value: s, label: DRUG_SCHEDULE_LABELS[s] })),
  )
  const candidate = {
    brand: values.brand ?? '',
    generic: values.generic ?? '',
    strength: values.strength ?? '',
    form,
    manufacturer: values.manufacturer ?? '',
    drugClass: values.drugClass ?? '',
    schedule: schedule || 'none',
    highAlert: parseImportBool(values.highAlert ?? ''),
  }
  const parsed = drugInputSchema.safeParse(candidate)
  return parsed.success ? { input: parsed.data } : { error: parsed.error.issues[0]?.message ?? 'Invalid row' }
}

export function DrugsPage() {
  const [q, setQ] = useState('')
  const [debounced] = useDebouncedValue(q, 200)
  const [schedule, setSchedule] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const { data } = useDrugs({ q: debounced, schedule: schedule ?? undefined, includeInactive: showInactive, page })
  const { data: forms } = useValueList('dosageForm')
  const setActive = useSetDrugActive()
  const canEdit = useCan('masters.drugs.edit')
  const canCancel = useCan('masters.drugs.cancel')
  const [modal, setModal] = useState<{ open: boolean; drug: Drug | null }>({ open: false, drug: null })
  const [importOpen, setImportOpen] = useState(false)
  const saveDrug = useSaveDrug()
  const formLabel = (code: string) => forms?.find((f) => f.code === code)?.label ?? code
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const toggle = (d: Drug) => {
    const run = () => setActive.mutate({ id: d.id, active: !d.active }, { onSuccess: () => notifySaved(`${d.brand} ${d.active ? 'deactivated' : 'reactivated'}.`), onError: (e) => showApiError(e) })
    if (d.active) confirmDeactivate(d.brand, 'Doctors will no longer find it when prescribing.', run)
    else run()
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Drugs"
        subtitle="Brands doctors pick in the e-prescription. Schedule H1 and X drugs are flagged on the prescription; high-alert drugs warn the doctor."
        actions={
          <Can permission="masters.drugs.create">
            <Group gap="xs">
              <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} onClick={() => setImportOpen(true)}>
                Import from Excel
              </Button>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true, drug: null })}>
                Add drug
              </Button>
            </Group>
          </Can>
        }
      />
      <Card withBorder radius="md" p={0}>
        <Group p="sm" justify="space-between">
          <Group gap="sm">
            <TextInput
              placeholder="Search brand or generic"
              leftSection={<IconSearch size={16} />}
              value={q}
              onChange={(e) => {
                setQ(e.currentTarget.value)
                setPage(1)
              }}
              w={280}
              aria-label="Search drugs"
              autoFocus
            />
            <Select
              placeholder="All schedules"
              data={[...DRUG_SCHEDULES.map((s) => ({ value: s, label: DRUG_SCHEDULE_LABELS[s] })), { value: 'highAlert', label: 'High-alert only' }]}
              value={schedule}
              onChange={(v) => {
                setSchedule(v)
                setPage(1)
              }}
              clearable
              w={190}
              aria-label="Filter by schedule"
            />
          </Group>
          <Group gap="md">
            <Switch label="Show inactive" checked={showInactive} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
            <Text size="sm" c="dimmed">
              {data ? `${data.total} drugs` : ''}
            </Text>
          </Group>
        </Group>
        <Table.ScrollContainer minWidth={900}>
          <Table highlightOnHover verticalSpacing={8}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Brand</Table.Th>
                <Table.Th>Generic</Table.Th>
                <Table.Th>Strength</Table.Th>
                <Table.Th>Form</Table.Th>
                <Table.Th>Manufacturer</Table.Th>
                <Table.Th>Schedule</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="lg">
                      No drugs match “{q}”.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {data?.items.map((d) => (
                <Table.Tr key={d.id} style={d.active ? undefined : { opacity: 0.6 }}>
                  <Table.Td>
                    <Group gap={6}>
                      <Text size="sm" fw={600}>
                        {d.brand}
                      </Text>
                      {d.highAlert && (
                        <Badge size="xs" color="red" variant="filled" leftSection={<IconAlertTriangle size={10} />}>
                          High alert
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{d.generic}</Text>
                    {d.drugClass && (
                      <Text size="xs" c="dimmed">
                        {d.drugClass}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{d.strength}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formLabel(d.form)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {d.manufacturer}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {d.schedule !== 'none' && (
                      <Badge size="sm" variant="light" color={SCHEDULE_COLORS[d.schedule]}>
                        {d.schedule}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {(canEdit || canCancel) && (
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${d.brand}`}>
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {canEdit && (
                            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setModal({ open: true, drug: d })}>
                              Edit
                            </Menu.Item>
                          )}
                          {d.active && canCancel && (
                            <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={() => toggle(d)}>
                              Deactivate
                            </Menu.Item>
                          )}
                          {!d.active && canEdit && (
                            <Menu.Item leftSection={<IconRestore size={16} />} onClick={() => toggle(d)}>
                              Reactivate
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {pages > 1 && (
          <Group justify="center" p="sm">
            <Pagination total={pages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
      </Card>
      <DrugFormModal opened={modal.open} drug={modal.drug} onClose={() => setModal({ open: false, drug: null })} />
      <ExcelImportModal<DrugInput>
        opened={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import drugs from Excel"
        templateFilename="drugs-template.xlsx"
        columns={DRUG_IMPORT_COLUMNS}
        toInput={(values) => drugRowToInput(values, forms ?? [])}
        importRow={(input) => saveDrug.mutateAsync({ input })}
      />
    </Stack>
  )
}

const blank: DrugInput = { brand: '', generic: '', strength: '', form: 'TABLET', manufacturer: '', drugClass: '', schedule: 'H', highAlert: false }

function DrugFormModal({ opened, onClose, drug }: { opened: boolean; onClose: () => void; drug: Drug | null }) {
  const save = useSaveDrug()
  const { data: generics } = useGenerics()
  const { data: forms } = useValueList('dosageForm')
  const { register, control, handleSubmit, reset, setError, formState } = useForm<DrugInput>({ resolver: zodResolver(drugInputSchema) })
  useEffect(() => {
    if (opened) reset(drug ? { ...blank, ...drug } : blank)
  }, [opened, drug, reset])
  const e = formState.errors

  const onSubmit = handleSubmit((input) =>
    save.mutate(
      { id: drug?.id, input },
      {
        onSuccess: (d) => {
          notifySaved(`${d.brand} saved.`)
          onClose()
        },
        onError: (err) => showApiError(err, setError),
      },
    ),
  )

  return (
    <Modal opened={opened} onClose={onClose} title={drug ? `Edit ${drug.brand}` : 'Add drug'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Brand name" placeholder="e.g. Dolo 650" withAsterisk data-autofocus {...register('brand')} error={e.brand?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={control}
                name="generic"
                render={({ field, fieldState }) => (
                  <Autocomplete label="Generic (salt)" placeholder="e.g. Paracetamol" withAsterisk data={generics ?? []} limit={8} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <TextInput label="Strength" placeholder="500 mg" withAsterisk {...register('strength')} error={e.strength?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Controller
                control={control}
                name="form"
                render={({ field, fieldState }) => (
                  <Select label="Form" withAsterisk searchable data={(forms ?? []).map((f) => ({ value: f.code, label: f.label }))} allowDeselect={false} value={field.value} onChange={(v) => field.onChange(v ?? '')} error={fieldState.error?.message} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={control}
                name="schedule"
                render={({ field }) => <Select label="Schedule" data={DRUG_SCHEDULES.map((s) => ({ value: s, label: DRUG_SCHEDULE_LABELS[s] }))} allowDeselect={false} {...field} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Manufacturer" {...register('manufacturer')} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Class" placeholder="e.g. Antibiotic" {...register('drugClass')} />
            </Grid.Col>
            <Grid.Col span={12}>
              <Controller
                control={control}
                name="highAlert"
                render={({ field }) => (
                  <Switch
                    label="High-alert drug"
                    description="Insulin, anticoagulants, opioids… the doctor sees a warning when prescribing"
                    checked={field.value}
                    onChange={(ev) => field.onChange(ev.currentTarget.checked)}
                  />
                )}
              />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
