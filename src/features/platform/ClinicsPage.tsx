import { ActionIcon, Anchor, Badge, Button, Card, Group, Menu, Progress, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconDots, IconMail, IconPencil, IconPlus, IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/dates'
import { inviteUrl } from '@/lib/invite'
import { PLAN_LABELS, type ClinicSummary, type ProvisionResult } from '@/types/clinic'
import { ProvisionResultModal } from './ProvisionResultModal'
import { useClinics, useResendAdminInvite } from './queries'

export function ClinicsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: clinics, isPending } = useClinics()
  const [query, setQuery] = useState('')
  // Arrives via router state after "Create clinic" (its own route) succeeds.
  const [result, setResult] = useState<ProvisionResult | null>(() => (location.state as { provisionResult?: ProvisionResult } | null)?.provisionResult ?? null)
  const resend = useResendAdminInvite()
  const canEdit = useCan('platform.clinics.edit')

  // Clear the one-time navigation state so a later refresh or back-nav doesn't replay the result.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
    // Only on mount: this consumes router state exactly once, not whenever it's re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (clinics ?? []).filter((c) => !q || [c.name, c.code, c.city, c.state].some((v) => v.toLowerCase().includes(q)))
  }, [clinics, query])

  const resendInvite = (c: ClinicSummary) =>
    resend.mutate(c.id, {
      onSuccess: ({ inviteToken }) => {
        navigator.clipboard?.writeText(inviteUrl(inviteToken)).catch(() => undefined)
        notifications.show({ color: 'teal', title: 'New invite sent', message: `The new link for ${c.admin?.name} is copied. The old link no longer works.` })
      },
    })

  return (
    <Stack>
      <PageHeader
        title="Clinics"
        subtitle="Every hospital and clinic on the platform. Creating a clinic sets it up and invites its admin."
        actions={
          <Can permission="platform.clinics.create">
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/platform/clinics/new')}>
              Create clinic
            </Button>
          </Can>
        }
      />

      <Card withBorder radius="md" p={0}>
        <Group p="sm" justify="space-between">
          <TextInput
            placeholder="Search by name, code or city"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={320}
            aria-label="Search clinics"
          />
          <Text size="sm" c="dimmed">
            {clinics ? `${rows.length} of ${clinics.length} clinics` : ''}
          </Text>
        </Group>
        <Table.ScrollContainer minWidth={900}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Clinic</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Setup</Table.Th>
                <Table.Th>Clinic Admin</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isPending && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="lg">
                      Loading clinics…
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {!isPending && rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="lg">
                      No clinics match “{query}”.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Text fw={600}>{c.name}</Text>
                    <Text size="xs" c="dimmed">
                      {c.code}.yourhms.in · {c.city}, {c.state} · {c.beds} beds
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{PLAN_LABELS[c.plan]}</Text>
                    {c.trialEndsAt && (
                      <Text size="xs" c="dimmed">
                        until {formatDate(c.trialEndsAt)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge status={c.status} />
                  </Table.Td>
                  <Table.Td w={170}>
                    <Group gap={8} wrap="nowrap">
                      <Progress value={(c.setup.done / c.setup.required) * 100} w={80} color={c.setup.done === c.setup.required ? 'teal' : 'blue'} />
                      <Text size="sm">
                        {c.setup.done}/{c.setup.required}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {c.counts.doctors} doctors · {c.counts.users} users
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {c.admin ? (
                      <Stack gap={2}>
                        <Text size="sm">{c.admin.name}</Text>
                        {c.admin.status === 'invited' ? (
                          <Group gap={6}>
                            <Badge size="xs" color="yellow" variant="light">
                              Invite pending
                            </Badge>
                            {c.admin.inviteToken && (
                              <Anchor size="xs" href={`/invite/${c.admin.inviteToken}`} target="_blank">
                                Open invite (demo)
                              </Anchor>
                            )}
                          </Group>
                        ) : (
                          <Text size="xs" c="dimmed">
                            Active
                          </Text>
                        )}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(c.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    {canEdit && (
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <Tooltip label="Actions">
                            <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${c.name}`}>
                              <IconDots size={18} />
                            </ActionIcon>
                          </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/platform/clinics/${c.id}/edit`)}>
                            Edit plan or status
                          </Menu.Item>
                          {c.admin?.status === 'invited' && (
                            <Menu.Item leftSection={<IconMail size={16} />} onClick={() => resendInvite(c)}>
                              Re-send admin invite
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
      </Card>

      <ProvisionResultModal result={result} onClose={() => setResult(null)} />
    </Stack>
  )
}
