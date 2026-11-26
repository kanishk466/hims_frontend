import { ActionIcon, Badge, Button, Card, Group, Menu, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconDots, IconPencil, IconPlus, IconReceipt2, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { ActiveFilter } from '@/components/ActiveFilter'
import { confirmDeactivate } from '@/components/confirmDeactivate'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatDay, todayIST } from '@/lib/dates'
import { matchesActive, matchesText, type ActiveFilterValue } from '@/lib/filters'
import { formatINR } from '@/lib/money'
import { PANEL_TYPE_LABELS, type Panel } from '@/types/masters'
import { usePanels, useSetPanelActive } from './queries'

function copay(p: Panel) {
  if (p.coverage.copayFixedPaise) return `${formatINR(p.coverage.copayFixedPaise)} per visit`
  return p.coverage.copayPercent ? `${p.coverage.copayPercent}%` : 'None'
}

export function PanelsPage() {
  const navigate = useNavigate()
  const { data: panels } = usePanels(true)
  const setActive = useSetPanelActive()
  const canEdit = useCan('masters.panels.edit')
  const canCancel = useCan('masters.panels.cancel')
  const canTariffs = useCan('masters.tariffs.view')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<ActiveFilterValue>('active')
  const today = todayIST()

  const rows = useMemo(() => (panels ?? []).filter((p) => matchesActive(p.active, filter) && matchesText(q, p.name, p.code)), [panels, filter, q])
  const active = (panels ?? []).filter((p) => p.active).length
  const parentName = (id?: string | null) => panels?.find((p) => p.id === id)?.name

  const toggle = (p: Panel) => {
    const run = () => setActive.mutate({ id: p.id, active: !p.active }, { onSuccess: () => notifySaved(`${p.name} ${p.active ? 'deactivated' : 'reactivated'}.`), onError: (e) => showApiError(e) })
    if (p.active) confirmDeactivate(p.name, 'It can no longer be picked as payer at check-in.', run)
    else run()
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Panels"
        subtitle="Companies, TPAs, insurers and government schemes that pay all or part of a patient’s bill."
        actions={
          <Can permission="masters.panels.create">
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/masters/panels/new')}>
              Add panel
            </Button>
          </Can>
        }
      />
      <Card withBorder radius="md" p={0}>
        <Group p="sm" justify="space-between">
          <TextInput placeholder="Search name or code" leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} aria-label="Search panels" autoFocus />
          <ActiveFilter value={filter} onChange={setFilter} counts={{ active, inactive: (panels?.length ?? 0) - active }} />
        </Group>
        <Table.ScrollContainer minWidth={1000}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Panel</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Contract</Table.Th>
                <Table.Th>Rates</Table.Th>
                <Table.Th>Co-pay</Table.Th>
                <Table.Th>Credit</Table.Th>
                <Table.Th>Needs</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" ta="center" py="lg">
                      No panels here.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((p) => {
                const expired = p.contract.validTo < today
                return (
                  <Table.Tr key={p.id} style={p.active ? undefined : { opacity: 0.6 }}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {p.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {p.code}
                        {p.parentId ? ` · under ${parentName(p.parentId)}` : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="gray" size="sm">
                        {PANEL_TYPE_LABELS[p.type]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={expired ? 'red' : undefined}>
                        {formatDay(p.contract.validFrom)} – {formatDay(p.contract.validTo)}
                      </Text>
                      {expired && (
                        <Text size="xs" c="red">
                          Expired
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {p.contract.rateBasis === 'panelTariff'
                          ? 'Own rate list'
                          : `Hospital ${p.contract.adjustPercent === 0 ? 'rates' : `${p.contract.adjustPercent > 0 ? '+' : '−'}${Math.abs(p.contract.adjustPercent)}%`}`}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{copay(p)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.contract.creditDays} days</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {[...p.requirements.documents, p.requirements.priorApproval ? 'Prior approval' : null].filter(Boolean).join(', ') || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${p.name}`}>
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {canEdit && (
                            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/masters/panels/${p.id}/edit`)}>
                              Edit
                            </Menu.Item>
                          )}
                          {canTariffs && (
                            <Menu.Item leftSection={<IconReceipt2 size={16} />} component={Link} to="/masters/services?tab=tariffs">
                              Panel rates
                            </Menu.Item>
                          )}
                          {p.active && canCancel && (
                            <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={() => toggle(p)}>
                              Deactivate
                            </Menu.Item>
                          )}
                          {!p.active && canEdit && (
                            <Menu.Item leftSection={<IconRestore size={16} />} onClick={() => toggle(p)}>
                              Reactivate
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  )
}
