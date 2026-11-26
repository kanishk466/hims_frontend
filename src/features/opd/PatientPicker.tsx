import { Button, Card, Group, Kbd, Loader, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch, IconUserPlus } from '@tabler/icons-react'
import { useState, type KeyboardEvent } from 'react'
import { Can } from '@/auth/Can'
import { formatDay } from '@/lib/dates'
import type { PatientBrief } from '@/types/opd'
import { PatientBadge } from './PatientBadge'
import { usePatientSearch } from './queries'

interface Props {
  onPick: (p: PatientBrief) => void
  onRegister?: (prefill: string) => void
  autoFocus?: boolean
  placeholder?: string
}

/**
 * Search by UHID, mobile, name or ABHA. Arrow keys move, Enter picks: the front desk
 * never needs the mouse (OPD Spec screen 1).
 */
export function PatientPicker({ onPick, onRegister, autoFocus, placeholder = 'UHID, mobile, name or ABHA' }: Props) {
  const [q, setQ] = useState('')
  const [debounced] = useDebouncedValue(q, 150)
  const { data, isFetching } = usePatientSearch(debounced, debounced.trim().length >= 2)
  const [active, setActive] = useState(0)
  const results = debounced.trim().length >= 2 ? (data ?? []) : []

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      onPick(results[active]!)
    }
  }

  return (
    <Stack gap="xs">
      <TextInput
        placeholder={placeholder}
        leftSection={<IconSearch size={16} />}
        rightSection={isFetching ? <Loader size={14} /> : null}
        value={q}
        onChange={(e) => {
          setQ(e.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={onKey}
        autoFocus={autoFocus}
        aria-label="Search patients"
        size="md"
      />
      {results.length > 0 && (
        <Card withBorder radius="md" p={0}>
          <ScrollArea.Autosize mah={320}>
            <Stack gap={0} role="listbox" aria-label="Matching patients">
              {results.map((p, i) => (
                <UnstyledButton
                  key={p.id}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => onPick(p)}
                  onMouseEnter={() => setActive(i)}
                  px="sm"
                  py={8}
                  style={{ background: i === active ? 'var(--mantine-color-teal-0)' : undefined, borderBottom: '1px solid var(--mantine-color-gray-1)' }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <PatientBadge patient={p} />
                    <Text size="xs" c="dimmed">
                      {p.lastVisitDate ? `Last visit ${formatDay(p.lastVisitDate)}` : 'No visits yet'}
                    </Text>
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Card>
      )}
      {debounced.trim().length >= 2 && !isFetching && results.length === 0 && (
        <Text size="sm" c="dimmed">
          No patient matches “{debounced}”.
        </Text>
      )}
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          <Kbd size="xs">↑</Kbd> <Kbd size="xs">↓</Kbd> to move, <Kbd size="xs">Enter</Kbd> to pick
        </Text>
        {onRegister && (
          <Can permission="opd.registration.create">
            <Button size="compact-sm" variant="light" leftSection={<IconUserPlus size={14} />} onClick={() => onRegister(q)}>
              Register new patient
            </Button>
          </Can>
        )}
      </Group>
    </Stack>
  )
}
