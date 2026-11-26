import { ActionIcon, Badge, Button, Card, ColorSwatch, Group, Menu, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconDots, IconPencil, IconPlus, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { ActiveFilter } from '@/components/ActiveFilter'
import { confirmDeactivate } from '@/components/confirmDeactivate'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { matchesActive, matchesText, type ActiveFilterValue } from '@/lib/filters'
import type { Department } from '@/types/masters'
import { useDepartments, useDoctors, useMoveDepartment, useSetDepartmentActive } from './queries'

export function DepartmentsPage() {
  const navigate = useNavigate()
  const { data: departments } = useDepartments(true)
  const { data: doctors } = useDoctors(true)
  const setActive = useSetDepartmentActive()
  const move = useMoveDepartment()
  const canEdit = useCan('masters.departments.edit')
  const canCancel = useCan('masters.departments.cancel')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<ActiveFilterValue>('active')

  const rows = useMemo(() => (departments ?? []).filter((d) => matchesActive(d.active, filter) && matchesText(q, d.name, d.code)), [departments, filter, q])
  const activeList = (departments ?? []).filter((d) => d.active)
  const doctorCount = (id: string) => (doctors ?? []).filter((d) => d.departmentId === id && d.active).length

  const toggle = (d: Department) => {
    const run = () => setActive.mutate({ id: d.id, active: !d.active }, { onSuccess: () => notifySaved(`${d.name} ${d.active ? 'deactivated' : 'reactivated'}.`), onError: (e) => showApiError(e) })
    if (d.active) confirmDeactivate(d.name, 'It will no longer appear when adding doctors or on the queue screen.', run)
    else run()
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Departments"
        subtitle="Clinical departments run OPDs; non-clinical ones (lab, radiology) own investigations. The order here is the order on screens and reports."
        actions={
          <Can permission="masters.departments.create">
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/masters/departments/new')}>
              Add department
            </Button>
          </Can>
        }
      />
      <Card withBorder radius="md" p={0}>
        <Group p="sm" justify="space-between">
          <TextInput placeholder="Search name or code" leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={280} aria-label="Search departments" autoFocus />
          <ActiveFilter value={filter} onChange={setFilter} counts={{ active: activeList.length, inactive: (departments?.length ?? 0) - activeList.length }} />
        </Group>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={70}>Order</Table.Th>
              <Table.Th>Department</Table.Th>
              <Table.Th>Code</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Doctors</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" ta="center" py="lg">
                    No departments here.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((d) => {
              const i = activeList.findIndex((x) => x.id === d.id)
              return (
                <Table.Tr key={d.id} style={d.active ? undefined : { opacity: 0.6 }}>
                  <Table.Td>
                    {d.active && canEdit && (
                      <Group gap={0} wrap="nowrap">
                        <ActionIcon size="sm" variant="subtle" color="gray" disabled={i === 0 || move.isPending} onClick={() => move.mutate({ id: d.id, direction: 'up' })} aria-label={`Move ${d.name} up`}>
                          <IconArrowUp size={14} />
                        </ActionIcon>
                        <ActionIcon size="sm" variant="subtle" color="gray" disabled={i === activeList.length - 1 || move.isPending} onClick={() => move.mutate({ id: d.id, direction: 'down' })} aria-label={`Move ${d.name} down`}>
                          <IconArrowDown size={14} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ColorSwatch color={`var(--mantine-color-${d.queueColor}-6)`} size={14} />
                      <Text size="sm" fw={600}>
                        {d.name}
                      </Text>
                      {!d.active && (
                        <Badge size="xs" color="gray" variant="light">
                          Inactive
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {d.code}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{d.type === 'clinical' ? 'Clinical' : 'Non-clinical'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{doctorCount(d.id)}</Text>
                  </Table.Td>
                  <Table.Td>
                    {(canEdit || canCancel) && (
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${d.name}`}>
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {canEdit && (
                            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/masters/departments/${d.id}/edit`)}>
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
              )
            })}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  )
}
