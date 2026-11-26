import { Alert, Anchor, Badge, Button, Card, Group, Menu, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconCopy, IconDots, IconLock, IconRestore, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CLINIC_PERMISSIONS, type Permission } from '@/auth/permissions'
import { useCan } from '@/auth/useCan'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import type { RoleDetail } from '@/types/auth'
import { GRID } from './grid'
import { PermissionGrid } from './PermissionGrid'
import { useSetRoleActive, useUpdateRole } from './queries'

interface Props {
  role: RoleDetail
  onCopy: (role: RoleDetail) => void
  /** Lets the page ask before switching away from unsaved changes. */
  onDirtyChange: (dirty: boolean) => void
}

/** Name, description, who has the role, and its permission grid. Remount (key) per role. */
export function RoleEditor({ role, onCopy, onDirtyChange }: Props) {
  const canEdit = useCan('admin.roles.edit')
  const canCreate = useCan('admin.roles.create')
  const canCancel = useCan('admin.roles.cancel')
  const update = useUpdateRole()
  const setActive = useSetRoleActive()
  const readOnly = !canEdit || role.locked || !role.active

  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description)
  const [perms, setPerms] = useState<Set<Permission>>(() => new Set(role.permissions))
  const [limit, setLimit] = useState(role.discountLimitPercent)
  const [nameError, setNameError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const changes = useMemo(() => {
    const before = new Set(role.permissions)
    let n = 0
    for (const p of CLINIC_PERMISSIONS) if (before.has(p) !== perms.has(p)) n++
    return n
  }, [perms, role.permissions])
  const dirty = changes > 0 || name.trim() !== role.name || description.trim() !== role.description || limit !== role.discountLimitPercent

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const limitOnly = role.locked && canEdit && role.active
  const save = () => {
    if (!dirty || (readOnly && !limitOnly)) return
    update.mutate(
      { id: role.id, input: { name: name.trim(), description: description.trim(), permissions: [...perms], discountLimitPercent: limit } },
      {
        onSuccess: (r) => notifySaved(`${r.name} saved. Users get the change on their next action.`),
        onError: (e) => {
          showApiError(e)
          if (e && typeof e === 'object' && 'fieldErrors' in e) setNameError((e as { fieldErrors?: Record<string, string> }).fieldErrors?.name ?? null)
        },
      },
    )
  }
  const discard = () => {
    setName(role.name)
    setDescription(role.description)
    setPerms(new Set(role.permissions))
    setLimit(role.discountLimitPercent)
    setNameError(null)
  }
  useHotkeys([['mod+S', save]], [])

  const toggleModule = (m: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  const allCollapsed = collapsed.size === GRID.length

  return (
    <Stack gap="md">
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap="xs" style={{ flex: 1 }}>
            <Group gap="sm" align="flex-end">
              <TextInput
                label="Role name"
                value={name}
                onChange={(e) => {
                  setName(e.currentTarget.value)
                  setNameError(null)
                }}
                readOnly={readOnly}
                error={nameError}
                w={280}
              />
              <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} readOnly={readOnly} style={{ flex: 1 }} />
              <NumberInput
                label="Discount limit"
                description="Without approval"
                suffix=" %"
                min={0}
                max={100}
                allowDecimal={false}
                w={140}
                value={limit}
                onChange={(v) => setLimit(Number(v) || 0)}
                readOnly={!canEdit || !role.active}
              />
            </Group>
            <Group gap={6}>
              {role.isSystem && (
                <Badge variant="light" color="gray">
                  Built-in
                </Badge>
              )}
              {!role.active && (
                <Badge variant="light" color="red">
                  Inactive
                </Badge>
              )}
              <Text size="sm" c="dimmed">
                {perms.size} of {CLINIC_PERMISSIONS.length} permissions ·{' '}
                {role.users.length === 0
                  ? 'no users'
                  : `used by ${role.users
                      .slice(0, 4)
                      .map((u) => u.name)
                      .join(', ')}${role.users.length > 4 ? ` and ${role.users.length - 4} more` : ''}`}
              </Text>
              {role.users.length > 0 && (
                <Anchor component={Link} to={`/admin/users?role=${role.id}`} size="sm">
                  See users
                </Anchor>
              )}
            </Group>
          </Stack>
          {(canCreate || canCancel || canEdit) && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="default" rightSection={<IconDots size={16} />}>
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {canCreate && (
                  <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => onCopy(role)}>
                    Copy role
                  </Menu.Item>
                )}
                {!role.isSystem && role.active && canCancel && (
                  <Menu.Item
                    leftSection={<IconTrash size={16} />}
                    color="red"
                    onClick={() => setActive.mutate({ id: role.id, active: false }, { onSuccess: () => notifySaved(`${role.name} deactivated.`), onError: (e) => showApiError(e) })}
                  >
                    Deactivate role
                  </Menu.Item>
                )}
                {!role.active && canEdit && (
                  <Menu.Item leftSection={<IconRestore size={16} />} onClick={() => setActive.mutate({ id: role.id, active: true }, { onSuccess: () => notifySaved(`${role.name} reactivated.`), onError: (e) => showApiError(e) })}>
                    Reactivate role
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Card>

      {role.locked && (
        <Alert variant="light" color="blue" icon={<IconLock />}>
          Clinic Admin always has full access, so the clinic can never lock itself out. To make a limited admin, use <b>Copy role</b>.
        </Alert>
      )}

      <Card withBorder radius="md" p={0}>
        <Group justify="space-between" px="md" py="xs" wrap="nowrap">
          <Text size="sm" c="dimmed">
            Ticking an action also ticks View. Unticking View clears the row. Blank = not available on that screen.
          </Text>
          <Button variant="subtle" size="compact-sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(GRID.map((g) => g.module)))}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
        </Group>
        <PermissionGrid value={perms} onChange={setPerms} readOnly={readOnly} collapsed={collapsed} onToggleModule={toggleModule} />
      </Card>

      {dirty && (!readOnly || limitOnly) && (
        <Paper
          withBorder
          shadow="md"
          radius="md"
          p="sm"
          style={{ position: 'sticky', bottom: 12, zIndex: 5, borderColor: 'var(--mantine-color-teal-4)' }}
          role="region"
          aria-label="Unsaved changes"
        >
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              {changes > 0 ? `${changes} permission change${changes === 1 ? '' : 's'}` : 'Details changed'} — not saved yet
            </Text>
            <Group gap="xs">
              <Button variant="default" onClick={discard}>
                Discard
              </Button>
              <Button onClick={save} loading={update.isPending}>
                Save changes (Ctrl+S)
              </Button>
            </Group>
          </Group>
        </Paper>
      )}
    </Stack>
  )
}
