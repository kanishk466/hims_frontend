import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, PinInput, SegmentedControl, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconDots, IconEye, IconKey, IconLink, IconPencil, IconPlus, IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useSession, useStartPreview } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatDateTime } from '@/lib/dates'
import { inviteUrl } from '@/lib/invite'
import type { UserStatus, UserSummary } from '@/types/auth'
import { useResendInvite, useRoles, useSetOverridePin, useUsers } from './queries'

type StatusFilter = UserStatus | 'all'

export function UsersPage() {
  const { data: users, isPending } = useUsers()
  const { data: roles } = useRoles()
  const { data: session } = useSession()
  const resend = useResendInvite()
  const preview = useStartPreview()
  const navigate = useNavigate()
  const canEdit = useCan('admin.users.edit')
  const canPreview = useCan('admin.users.view')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [pinModal, setPinModal] = useState<UserSummary | null>(null)
  const roleFilter = params.get('role')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (users ?? []).filter(
      (u) =>
        (status === 'all' || u.status === status) &&
        (!roleFilter || u.roles.some((r) => r.id === roleFilter)) &&
        (!q || u.name.toLowerCase().includes(q) || u.mobile.includes(q) || u.username.includes(q) || u.designation.toLowerCase().includes(q)),
    )
  }, [users, query, status, roleFilter])

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, invited: 0, inactive: 0 }
    for (const u of users ?? []) {
      c.all++
      c[u.status]++
    }
    return c
  }, [users])

  const copyInvite = (u: UserSummary) =>
    resend.mutate(u.id, {
      onSuccess: ({ inviteToken }) => {
        navigator.clipboard?.writeText(inviteUrl(inviteToken)).catch(() => undefined)
        notifications.show({ color: 'teal', message: `New invite link for ${u.name} copied. The old link no longer works.` })
      },
      onError: (e) => showApiError(e),
    })

  // This page unmounts as soon as the preview starts (the user may not see it), so await, then navigate.
  const seeAs = async (u: UserSummary) => {
    try {
      await preview.mutateAsync(u.id)
      navigate('/', { replace: true })
    } catch (e) {
      showApiError(e)
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Users"
        subtitle="Everyone who logs in to this clinic. Each person gets their own login and one or more roles."
        actions={
          <Can permission="admin.users.create">
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/admin/users/new')}>
              Add user
            </Button>
          </Can>
        }
      />

      <Card withBorder radius="md" p={0}>
        <Group p="sm" gap="sm" justify="space-between">
          <Group gap="sm">
            <TextInput
              placeholder="Search name, mobile or job title"
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              w={280}
              aria-label="Search users"
              autoFocus
            />
            <Select
              placeholder="All roles"
              data={(roles ?? []).map((r) => ({ value: r.id, label: r.name }))}
              value={roleFilter}
              onChange={(v) => setParams(v ? { role: v } : {})}
              clearable
              w={200}
              aria-label="Filter by role"
            />
          </Group>
          <SegmentedControl
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            data={[
              { value: 'all', label: `All (${counts.all})` },
              { value: 'active', label: `Active (${counts.active})` },
              { value: 'invited', label: `Invited (${counts.invited})` },
              { value: 'inactive', label: `Inactive (${counts.inactive})` },
            ]}
            aria-label="Filter by status"
          />
        </Group>
        <Table.ScrollContainer minWidth={860}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Roles</Table.Th>
                <Table.Th>Mobile</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Last login</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isPending && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" ta="center" py="lg">
                      Loading users…
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {!isPending && rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" ta="center" py="lg">
                      No users match these filters.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((u) => {
                const isMe = u.id === session?.user.id
                return (
                  <Table.Tr key={u.id} style={u.status === 'inactive' ? { opacity: 0.6 } : undefined}>
                    <Table.Td>
                      <Group gap={6}>
                        <Text size="sm" fw={600}>
                          {u.name}
                        </Text>
                        {isMe && (
                          <Badge size="xs" variant="outline">
                            you
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {u.designation}
                        {u.doctor ? ` · linked to ${u.doctor.name}` : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {u.roles.map((r) => (
                          <Badge key={r.id} size="sm" variant="light">
                            {r.name}
                          </Badge>
                        ))}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{u.mobile}</Text>
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge status={u.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={u.lastLoginAt ? undefined : 'dimmed'}>
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${u.name}`}>
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {canPreview && !isMe && u.status !== 'inactive' && (
                            <Menu.Item leftSection={<IconEye size={16} />} onClick={() => seeAs(u)}>
                              See as this user
                            </Menu.Item>
                          )}
                          {canEdit && (
                            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/admin/users/${u.id}/edit`)}>
                              Edit
                            </Menu.Item>
                          )}
                          {canEdit && u.status === 'invited' && (
                            <Menu.Item leftSection={<IconLink size={16} />} onClick={() => copyInvite(u)}>
                              Copy new invite link
                            </Menu.Item>
                          )}
                          {canEdit && u.status === 'active' && (
                            <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setPinModal(u)}>
                              {u.hasOverridePin ? 'Change approval PIN' : 'Set approval PIN'}
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

      <OverridePinModal user={pinModal} onClose={() => setPinModal(null)} />
    </Stack>
  )
}

function OverridePinModal({ user, onClose }: { user: UserSummary | null; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const setOverridePin = useSetOverridePin()
  const close = () => {
    onClose()
    setPin('')
    setOverridePin.reset()
  }
  const save = (value: string | null) =>
    setOverridePin.mutate(
      { id: user!.id, input: { pin: value } },
      {
        onSuccess: () => {
          notifySaved(value ? `PIN set for ${user!.name}.` : `${user!.name}’s PIN was cleared.`)
          close()
        },
        onError: (e) => showApiError(e),
      },
    )
  return (
    <Modal opened={!!user} onClose={close} title={`Approval PIN · ${user?.name ?? ''}`}>
      <Stack>
        <Text size="sm" c="dimmed">
          Lets {user?.name} approve a cashier's discount above their own limit by typing this 4-digit PIN at the counter, without signing in. Meaningful only for someone who can approve discounts
          (Clinic Admin, Accounts or MD).
        </Text>
        <Group justify="center">
          <PinInput length={4} type="number" value={pin} onChange={setPin} aria-label="New PIN" autoFocus />
        </Group>
        <Group justify="space-between">
          {user?.hasOverridePin ? (
            <Button variant="subtle" color="red" onClick={() => save(null)} loading={setOverridePin.isPending}>
              Clear PIN
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => save(pin)} disabled={pin.length !== 4} loading={setOverridePin.isPending}>
              Save PIN
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
