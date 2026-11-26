import { Badge, Button, Card, Grid, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconLock, IconPlus } from '@tabler/icons-react'
import { useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { PageHeader } from '@/components/PageHeader'
import { useRoleDetails } from './queries'
import { RoleEditor } from './RoleEditor'

/** Roles & permissions: list of roles on the left, the selected role's grid on the right. */
export function RolesPage() {
  const navigate = useNavigate()
  const { data: roles } = useRoleDetails()
  const [params, setParams] = useSearchParams()
  const dirty = useRef(false)
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d
  }, [])

  if (!roles) return <Loader />
  const selected = roles.find((r) => r.id === params.get('role')) ?? roles[0]!

  const select = (id: string) => {
    if (id === selected.id) return
    const go = () => {
      dirty.current = false
      setParams({ role: id })
    }
    if (!dirty.current) return go()
    modals.openConfirmModal({
      title: 'Discard unsaved changes?',
      children: <Text size="sm">Your changes to {selected.name} have not been saved.</Text>,
      labels: { confirm: 'Discard changes', cancel: 'Keep editing' },
      confirmProps: { color: 'red' },
      onConfirm: go,
    })
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Roles & permissions"
        subtitle="A role is a set of ticks. Give users one or more roles on the Users screen."
        actions={
          <Can permission="admin.roles.create">
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/admin/roles/new')}>
              New role
            </Button>
          </Can>
        }
      />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder radius="md" padding={6}>
            <Stack gap={2} component="nav" aria-label="Roles">
              {roles.map((r) => {
                const active = r.id === selected.id
                return (
                  <UnstyledButton
                    key={r.id}
                    onClick={() => select(r.id)}
                    aria-current={active ? 'true' : undefined}
                    p={10}
                    style={{ borderRadius: 8, background: active ? 'var(--mantine-color-teal-0)' : undefined, opacity: r.active ? 1 : 0.55 }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <div style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={active ? 700 : 500} truncate>
                            {r.name}
                          </Text>
                          {r.locked && <IconLock size={13} color="var(--mantine-color-gray-6)" aria-label="Full access, locked" />}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {r.users.length} user{r.users.length === 1 ? '' : 's'} · {r.permissions.length} permissions
                        </Text>
                      </div>
                      {!r.isSystem && (
                        <Badge size="xs" variant="light" color={r.active ? 'grape' : 'gray'}>
                          {r.active ? 'custom' : 'inactive'}
                        </Badge>
                      )}
                    </Group>
                  </UnstyledButton>
                )
              })}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <RoleEditor key={`${selected.id}:${selected.permissions.join()}:${selected.name}:${selected.active}:${selected.discountLimitPercent}`} role={selected} onCopy={(r) => navigate(`/admin/roles/new/${r.id}`)} onDirtyChange={onDirtyChange} />
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
