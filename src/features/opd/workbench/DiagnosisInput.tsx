import { ActionIcon, Badge, Combobox, Group, SegmentedControl, Stack, Text, TextInput, useCombobox } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import type { Diagnosis } from '@/types/opd'
import { useIcdSearch } from '../queries'

/** ICD-10 search by code or words; each diagnosis is provisional or final (OPD-07). */
export function DiagnosisInput({ value, onChange, error, readOnly }: { value: Diagnosis[]; onChange: (d: Diagnosis[]) => void; error?: string; readOnly?: boolean }) {
  const [q, setQ] = useState('')
  const [debounced] = useDebouncedValue(q, 200)
  const { data: hits } = useIcdSearch(debounced)
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })
  const options = (hits ?? []).filter((h) => !value.some((d) => d.code === h.code)).slice(0, 10)

  const add = (code: string) => {
    const h = options.find((o) => o.code === code)
    if (!h) return
    onChange([...value, { code: h.code, name: h.name, type: 'provisional' }])
    setQ('')
    combobox.closeDropdown()
  }

  return (
    <Stack gap={6}>
      {value.map((d, i) => (
        <Group key={d.code} justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Badge variant="outline" radius="sm" style={{ flexShrink: 0 }}>
              {d.code}
            </Badge>
            <Text size="sm" truncate>
              {d.name}
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <SegmentedControl
              size="xs"
              disabled={readOnly}
              value={d.type}
              data={[
                { value: 'provisional', label: 'Provisional' },
                { value: 'final', label: 'Final' },
              ]}
              onChange={(t) => onChange(value.map((x, j) => (j === i ? { ...x, type: t as Diagnosis['type'] } : x)))}
            />
            {!readOnly && (
              <ActionIcon variant="subtle" color="gray" aria-label={`Remove ${d.code}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <IconX size={16} />
              </ActionIcon>
            )}
          </Group>
        </Group>
      ))}
      {!readOnly && (
        <Combobox store={combobox} onOptionSubmit={add}>
          <Combobox.Target>
            <TextInput
              placeholder="Search ICD-10: type a code (J06) or words (fever, diabetes)"
              leftSection={<IconSearch size={16} />}
              aria-label="Search diagnosis"
              value={q}
              error={error}
              onChange={(e) => {
                setQ(e.currentTarget.value)
                combobox.openDropdown()
                combobox.updateSelectedOptionIndex()
              }}
              onFocus={() => q && combobox.openDropdown()}
              onBlur={() => combobox.closeDropdown()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && options.length && combobox.getSelectedOptionIndex() < 0) {
                  e.preventDefault()
                  add(options[0].code)
                }
              }}
            />
          </Combobox.Target>
          <Combobox.Dropdown hidden={q.trim().length < 2}>
            <Combobox.Options>
              {options.length === 0 && <Combobox.Empty>No match</Combobox.Empty>}
              {options.map((o) => (
                <Combobox.Option value={o.code} key={o.code}>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm" fw={600} w={56}>
                      {o.code}
                    </Text>
                    <Text size="sm">{o.name}</Text>
                  </Group>
                </Combobox.Option>
              ))}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      )}
    </Stack>
  )
}
