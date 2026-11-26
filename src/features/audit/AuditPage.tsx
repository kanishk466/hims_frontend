import { Badge, Card, Code, Group, Pagination, Select, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { listAudit } from '@/api/audit'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime } from '@/lib/dates'

const ENTITIES = [
  { value: 'session', label: 'Logins' },
  { value: 'user', label: 'Users' },
  { value: 'role', label: 'Roles' },
  { value: 'clinic', label: 'Clinic settings' },
  { value: 'department', label: 'Departments' },
  { value: 'doctor', label: 'Doctors' },
  { value: 'schedule', label: 'Schedules' },
  { value: 'leave', label: 'Leave & holidays' },
  { value: 'service', label: 'Services' },
  { value: 'tariff', label: 'Tariffs' },
  { value: 'panel', label: 'Panels' },
  { value: 'drug', label: 'Drugs' },
  { value: 'valueList', label: 'Value lists' },
  { value: 'visit', label: 'Visits' },
  { value: 'bill', label: 'Bills' },
  { value: 'dayEnd', label: 'Day-end' },
  { value: 'message', label: 'Messages (SMS/WhatsApp)' },
]

const ACTION_COLORS: Record<string, string> = {
  create: 'teal',
  edit: 'blue',
  cancel: 'red',
  deactivate: 'red',
  activate: 'teal',
  login: 'gray',
  logout: 'gray',
  invite: 'yellow',
  preview: 'orange',
  approve: 'teal',
  reject: 'red',
}

/** Audit log: who created, changed or cancelled what, and when. Read-only. */
export function AuditPage() {
  const [q, setQ] = useState('')
  const [debounced] = useDebouncedValue(q, 250)
  const [entity, setEntity] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const { data, isPending } = useQuery({
    queryKey: ['audit', debounced, entity, page],
    queryFn: () => listAudit({ q: debounced, entity: entity ?? undefined, page }),
    placeholderData: keepPreviousData,
  })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <Stack gap="lg">
      <PageHeader title="Audit log" subtitle="Every login, change and cancellation in this clinic. Entries cannot be edited or deleted." />
      <Card withBorder radius="md" p={0}>
        <Group p="sm" gap="sm">
          <TextInput
            placeholder="Search who or what"
            leftSection={<IconSearch size={16} />}
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value)
              setPage(1)
            }}
            w={280}
            aria-label="Search audit log"
            autoFocus
          />
          <Select
            placeholder="Everything"
            data={ENTITIES}
            value={entity}
            onChange={(v) => {
              setEntity(v)
              setPage(1)
            }}
            clearable
            w={200}
            aria-label="Filter by area"
          />
          <Text size="sm" c="dimmed" ml="auto">
            {data ? `${data.total} entries` : ''}
          </Text>
        </Group>
        <Table verticalSpacing={8} highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={190}>When</Table.Th>
              <Table.Th w={190}>Who</Table.Th>
              <Table.Th w={110}>Action</Table.Th>
              <Table.Th>What</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!isPending && data?.items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" ta="center" py="lg">
                    No entries match.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {data?.items.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>
                  <Text size="sm">{formatDateTime(a.at)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{a.userName}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={ACTION_COLORS[a.action] ?? 'gray'}>
                    {a.action}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {a.details ? (
                    <Tooltip label={<Code block>{a.details}</Code>} multiline maw={520} withinPortal>
                      <Text size="sm" style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
                        {a.summary}
                      </Text>
                    </Tooltip>
                  ) : (
                    <Text size="sm">{a.summary}</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {pages > 1 && (
          <Group justify="center" p="sm">
            <Pagination total={pages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
      </Card>
    </Stack>
  )
}
