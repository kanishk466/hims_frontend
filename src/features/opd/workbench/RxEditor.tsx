import { ActionIcon, Alert, Combobox, Group, NumberInput, Select, Stack, Table, Text, TextInput, useCombobox } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconAlertTriangle, IconPill, IconX } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { rxAlerts, rxQuantity } from '@/lib/opd/rx'
import type { Drug } from '@/types/masters'
import type { RxItem } from '@/types/opd'
import { useDrugs, useValueList } from '../../masters/queries'
import { newRxItem } from './rxDefaults'

interface Props {
  value: RxItem[]
  onChange: (rx: RxItem[]) => void
  allergies: string[]
  readOnly?: boolean
}

/** e-Prescription lines (OPD-08): search brand or generic, defaults filled in, quantity worked out. */
export function RxEditor({ value, onChange, allergies, readOnly }: Props) {
  const [q, setQ] = useState('')
  const [debounced] = useDebouncedValue(q, 200)
  const { data: found } = useDrugs({ q: debounced, pageSize: 12 })
  // Every drug the page has seen, so alerts know the class and high-alert flag of lines from templates too.
  const { data: all } = useDrugs({ pageSize: 1000 })
  const { data: freq } = useValueList('frequency')
  const { data: timing } = useValueList('timing')
  const { data: routes } = useValueList('route')
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })
  const options = debounced.trim().length >= 2 ? (found?.items ?? []) : []
  const drugs = useMemo(() => new Map<string, Drug>((all?.items ?? []).map((d) => [d.id, d])), [all])
  const perDay = (code: string) => Number(freq?.find((f) => f.code === code)?.meta.perDay ?? 0)
  const alerts = rxAlerts(value, allergies, (id) => drugs.get(id))

  const add = (id: string) => {
    const d = options.find((o) => o.id === id)
    if (!d) return
    const item = newRxItem(d)
    onChange([...value, { ...item, qty: rxQuantity(item, perDay(item.frequency)) }])
    setQ('')
    combobox.closeDropdown()
  }
  const update = (i: number, patch: Partial<RxItem>) =>
    onChange(
      value.map((x, j) => {
        if (j !== i) return x
        const next = { ...x, ...patch }
        return { ...next, qty: rxQuantity(next, perDay(next.frequency)) }
      }),
    )
  const opts = (list?: { code: string; label: string }[]) => (list ?? []).map((x) => ({ value: x.code, label: x.label }))

  return (
    <Stack gap="xs">
      {value.length > 0 && (
        <Table verticalSpacing={4} horizontalSpacing={6} withRowBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Drug</Table.Th>
              <Table.Th w={90}>Dose</Table.Th>
              <Table.Th w={150}>How often</Table.Th>
              <Table.Th w={130}>When</Table.Th>
              <Table.Th w={140}>For</Table.Th>
              <Table.Th w={50}>Qty</Table.Th>
              <Table.Th w={30} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {value.map((it, i) => {
              const bad = alerts.some((a) => a.drugId === it.drugId && a.kind === 'allergy')
              return (
                <Table.Tr key={`${it.drugId}-${i}`} bg={bad ? 'red.0' : undefined}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {it.brand}{' '}
                      <Text span size="xs" c="dimmed" fw={400}>
                        {it.strength}
                      </Text>
                    </Text>
                    <Text size="xs" c="dimmed">
                      {it.generic}
                    </Text>
                    <TextInput
                      size="xs"
                      mt={4}
                      variant="unstyled"
                      placeholder="+ instruction (e.g. only if fever)"
                      aria-label={`Instruction for ${it.brand}`}
                      value={it.instructions ?? ''}
                      readOnly={readOnly}
                      onChange={(e) => update(i, { instructions: e.currentTarget.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput size="xs" aria-label={`Dose of ${it.brand}`} value={it.dose} readOnly={readOnly} onChange={(e) => update(i, { dose: e.currentTarget.value })} />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      aria-label={`Frequency of ${it.brand}`}
                      data={opts(freq)}
                      value={it.frequency}
                      readOnly={readOnly}
                      allowDeselect={false}
                      onChange={(v) => v && update(i, { frequency: v })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      aria-label={`Timing of ${it.brand}`}
                      data={opts(timing)}
                      value={it.timing || null}
                      readOnly={readOnly}
                      clearable
                      onChange={(v) => update(i, { timing: v ?? '' })}
                    />
                    {it.route !== 'PO' && (
                      <Select
                        size="xs"
                        mt={4}
                        aria-label={`Route of ${it.brand}`}
                        data={opts(routes)}
                        value={it.route}
                        readOnly={readOnly}
                        allowDeselect={false}
                        onChange={(v) => v && update(i, { route: v })}
                      />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <NumberInput
                        size="xs"
                        w={52}
                        min={1}
                        max={365}
                        hideControls
                        aria-label={`Duration of ${it.brand}`}
                        value={it.duration}
                        readOnly={readOnly}
                        onChange={(v) => update(i, { duration: Number(v) || 1 })}
                      />
                      <Select
                        size="xs"
                        w={78}
                        aria-label={`Duration unit of ${it.brand}`}
                        data={[
                          { value: 'D', label: 'days' },
                          { value: 'W', label: 'wks' },
                          { value: 'M', label: 'mths' },
                        ]}
                        value={it.durationUnit}
                        readOnly={readOnly}
                        allowDeselect={false}
                        onChange={(v) =>
                          v &&
                          update(i, {
                            durationUnit: v as RxItem['durationUnit'],
                          })
                        }
                      />
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{it.qty ?? '–'}</Text>
                  </Table.Td>
                  <Table.Td>
                    {!readOnly && (
                      <ActionIcon variant="subtle" color="gray" aria-label={`Remove ${it.brand}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                        <IconX size={16} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      )}
      {alerts.length > 0 && (
        <Alert color={alerts.some((a) => a.kind === 'allergy') ? 'red' : 'orange'} variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
          {alerts.map((a, i) => (
            <Text key={i} size="sm">
              {a.text}
            </Text>
          ))}
        </Alert>
      )}
      {!readOnly && (
        <Combobox store={combobox} onOptionSubmit={add}>
          <Combobox.Target>
            <TextInput
              placeholder="Add a drug: type brand or generic (Dolo, paracetamol)"
              leftSection={<IconPill size={16} />}
              aria-label="Add drug"
              value={q}
              onChange={(e) => {
                setQ(e.currentTarget.value)
                combobox.openDropdown()
                combobox.updateSelectedOptionIndex()
              }}
              onBlur={() => combobox.closeDropdown()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && options.length && combobox.getSelectedOptionIndex() < 0) {
                  e.preventDefault()
                  add(options[0].id)
                }
              }}
            />
          </Combobox.Target>
          <Combobox.Dropdown hidden={q.trim().length < 2}>
            <Combobox.Options>
              {options.length === 0 && <Combobox.Empty>No drug found</Combobox.Empty>}
              {options.map((d) => (
                <Combobox.Option value={d.id} key={d.id}>
                  <Text size="sm" fw={600}>
                    {d.brand}{' '}
                    <Text span size="xs" c="dimmed">
                      {d.strength} · {d.form.toLowerCase()}
                    </Text>
                  </Text>
                  <Text size="xs" c="dimmed">
                    {d.generic}
                    {d.highAlert ? ' · high alert' : ''}
                  </Text>
                </Combobox.Option>
              ))}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      )}
    </Stack>
  )
}
