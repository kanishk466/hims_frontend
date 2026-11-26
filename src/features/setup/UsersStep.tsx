import { ActionIcon, Badge, Button, Card, Group, List, Loader, Stack, Table, Text, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconCircleDashed, IconLink, IconPencil, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { StatusBadge } from '@/components/StatusBadge'
import { showApiError } from '@/lib/apiErrors'
import { inviteUrl } from '@/lib/invite'
import type { UserSummary } from '@/types/auth'
import { UserFormModal } from '../users/UserFormModal'
import { useResendInvite, useRoles, useUsers } from '../users/queries'
import { StepFooter } from './StepFooter'

/** Wizard step 5: at least one front office login and one doctor login. */
export function UsersStep({ onNext, finishReady }: { onNext: () => void; finishReady: boolean }) {
  const { data: users } = useUsers()
  const { data: roles } = useRoles()
  const resend = useResendInvite()
  const canEdit = useCan('admin.users.edit')
  const [modal, setModal] = useState<{ open: boolean; user: UserSummary | null; preset?: string[] }>({ open: false, user: null })

  if (!users || !roles) return <Loader />
  const roleIdOf = (key: string) => roles.find((r) => r.templateKey === key)?.id
  const live = users.filter((u) => u.status !== 'inactive')
  const has = (key: string) => live.some((u) => u.roles.some((r) => r.id === roleIdOf(key)))
  const needs = [
    { key: 'frontOffice', label: 'A front office login', done: has('frontOffice') },
    { key: 'doctor', label: 'A doctor login', done: has('doctor') },
  ]

  const copyInvite = (u: UserSummary) =>
    resend.mutate(u.id, {
      onSuccess: ({ inviteToken }) => {
        navigator.clipboard?.writeText(inviteUrl(inviteToken)).catch(() => undefined)
        notifications.show({ color: 'teal', message: `New invite link for ${u.name} copied.` })
      },
      onError: (e) => showApiError(e),
    })

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={3} fz="h4">
            Users and roles
          </Title>
          <Text c="dimmed" size="sm">
            Give each staff member their own login. Shared logins make the audit trail useless.
          </Text>
        </div>
        <Can permission="admin.users.create">
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true, user: null })}>
            Add user
          </Button>
        </Can>
      </Group>

      <Card withBorder radius="md" padding="sm">
        <Text size="sm" fw={600} mb={6}>
          Needed before the first patient
        </Text>
        <List spacing={6} size="sm" center>
          {needs.map((n) => (
            <List.Item
              key={n.key}
              icon={
                <ThemeIcon size={20} radius="xl" color={n.done ? 'teal' : 'gray'} variant={n.done ? 'filled' : 'light'}>
                  {n.done ? <IconCheck size={12} /> : <IconCircleDashed size={12} />}
                </ThemeIcon>
              }
            >
              <Group gap="xs">
                <Text size="sm">{n.label}</Text>
                {!n.done && (
                  <Can permission="admin.users.create">
                    <Button size="compact-xs" variant="light" onClick={() => setModal({ open: true, user: null, preset: [roleIdOf(n.key)!] })}>
                      Add
                    </Button>
                  </Can>
                )}
              </Group>
            </List.Item>
          ))}
        </List>
      </Card>

      <Card withBorder radius="md" p={0}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Roles</Table.Th>
              <Table.Th>Mobile</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th w={80} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id} style={u.status === 'inactive' ? { opacity: 0.55 } : undefined}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {u.name}
                  </Text>
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
                  <Group gap={2} justify="flex-end" wrap="nowrap">
                    {u.status === 'invited' && canEdit && (
                      <Tooltip label="Copy a new invite link">
                        <ActionIcon variant="subtle" color="gray" onClick={() => copyInvite(u)} aria-label={`Copy invite link for ${u.name}`}>
                          <IconLink size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {canEdit && (
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" color="gray" onClick={() => setModal({ open: true, user: u })} aria-label={`Edit ${u.name}`}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <StepFooter
        canEdit
        submit={false}
        onContinue={onNext}
        continueDisabled={!needs.every((n) => n.done)}
        hint={needs.every((n) => n.done) ? (finishReady ? 'All required steps are done.' : 'Invited users can log in once they accept their invite.') : 'Add a front office login and a doctor login to continue.'}
      />
      <UserFormModal opened={modal.open} user={modal.user} presetRoleIds={modal.preset} onClose={() => setModal({ open: false, user: null })} />
    </Stack>
  )
}
