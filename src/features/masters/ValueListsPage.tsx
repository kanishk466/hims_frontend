import { ActionIcon, Badge, Button, Card, Grid, Group, Modal, NumberInput, Select, Stack, Switch, Table, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconLock, IconPencil, IconPlus, IconRestore, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { isApiError } from '@/api/client'
import { VALUE_LIST_TYPES, type MetaField, type ValueListItem, type ValueListType } from '@/types/valueLists'
import { useMoveValueListItem, useSaveValueListItem, useSetValueListItemActive, useValueList, useValueListCounts } from './queries'

const GROUPS = ['Registration', 'Visits & billing', 'Clinical', 'Panels'] as const

/** One screen for all small lists (salutations, visit types, frequencies…). */
export function ValueListsPage() {
  const [params, setParams] = useSearchParams()
  const type = VALUE_LIST_TYPES.find((t) => t.key === params.get('list')) ?? VALUE_LIST_TYPES[0]!
  const { data: counts } = useValueListCounts()

  return (
    <Stack gap="lg">
      <PageHeader title="Value lists" subtitle="Small lists used in forms across the app. Rows are never deleted; deactivate what you no longer use." />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder radius="md" padding={6}>
            <Stack gap={8} component="nav" aria-label="Lists">
              {GROUPS.map((g) => (
                <Stack key={g} gap={0}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={10} py={4}>
                    {g}
                  </Text>
                  {VALUE_LIST_TYPES.filter((t) => t.group === g).map((t) => {
                    const active = t.key === type.key
                    return (
                      <UnstyledButton
                        key={t.key}
                        onClick={() => setParams({ list: t.key })}
                        aria-current={active ? 'true' : undefined}
                        px={10}
                        py={6}
                        style={{ borderRadius: 6, background: active ? 'var(--mantine-color-teal-0)' : undefined }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm" fw={active ? 700 : 400}>
                            {t.label}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {counts?.[t.key] ?? 0}
                          </Text>
                        </Group>
                      </UnstyledButton>
                    )
                  })}
                </Stack>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <ListEditor key={type.key} type={type} />
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

function metaText(f: MetaField, v: ValueListItem['meta'][string]) {
  if (f.type === 'boolean') return v ? 'Yes' : 'No'
  if (f.type === 'select') return f.options.find((o) => o.value === v)?.label ?? String(v ?? '')
  return `${v ?? 0}${f.suffix ? ` ${f.suffix}` : ''}`
}

function ListEditor({ type }: { type: ValueListType }) {
  const canEdit = useCan('masters.valueLists.edit')
  const canCancel = useCan('masters.valueLists.cancel')
  const [showInactive, setShowInactive] = useState(false)
  const { data: items } = useValueList(type.key, true)
  const setActive = useSetValueListItemActive()
  const move = useMoveValueListItem()
  const [modal, setModal] = useState<{ open: boolean; item: ValueListItem | null }>({ open: false, item: null })
  const rows = useMemo(() => (items ?? []).filter((i) => showInactive || i.active), [items, showInactive])
  const activeRows = (items ?? []).filter((i) => i.active)

  return (
    <Card withBorder radius="md" p={0}>
      <Group p="sm" justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={700}>{type.label}</Text>
          {type.description && (
            <Text size="sm" c="dimmed">
              {type.description}
            </Text>
          )}
        </div>
        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Switch label="Show inactive" checked={showInactive} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
          <Can permission="masters.valueLists.create">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true, item: null })}>
              Add
            </Button>
          </Can>
        </Group>
      </Group>
      <Table highlightOnHover verticalSpacing={6}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={70}>Order</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th>Code</Table.Th>
            {type.fields.map((f) => (
              <Table.Th key={f.key}>{f.label}</Table.Th>
            ))}
            <Table.Th w={80} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((item) => {
            const i = activeRows.indexOf(item)
            return (
              <Table.Tr key={item.id} style={item.active ? undefined : { opacity: 0.55 }}>
                <Table.Td>
                  {item.active && canEdit && (
                    <Group gap={0} wrap="nowrap">
                      <ActionIcon size="sm" variant="subtle" color="gray" disabled={i === 0} onClick={() => move.mutate({ id: item.id, direction: 'up' })} aria-label={`Move ${item.label} up`}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="subtle" color="gray" disabled={i === activeRows.length - 1} onClick={() => move.mutate({ id: item.id, direction: 'down' })} aria-label={`Move ${item.label} down`}>
                        <IconArrowDown size={14} />
                      </ActionIcon>
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <Text size="sm" fw={500}>
                      {item.label}
                    </Text>
                    {item.locked && (
                      <Tooltip label="Used by the system: can be renamed, not removed">
                        <IconLock size={13} color="var(--mantine-color-gray-6)" aria-label="Locked" />
                      </Tooltip>
                    )}
                    {!item.active && (
                      <Badge size="xs" color="gray" variant="light">
                        Inactive
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" ff="monospace" c="dimmed">
                    {item.code}
                  </Text>
                </Table.Td>
                {type.fields.map((f) => (
                  <Table.Td key={f.key}>
                    <Text size="sm">{metaText(f, item.meta[f.key])}</Text>
                  </Table.Td>
                ))}
                <Table.Td>
                  <Group gap={2} justify="flex-end" wrap="nowrap">
                    {canEdit && (
                      <ActionIcon variant="subtle" color="gray" onClick={() => setModal({ open: true, item })} aria-label={`Edit ${item.label}`}>
                        <IconPencil size={16} />
                      </ActionIcon>
                    )}
                    {item.active && canCancel && !item.locked && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={`Deactivate ${item.label}`}
                        onClick={() => setActive.mutate({ id: item.id, active: false }, { onSuccess: () => notifySaved(`${item.label} deactivated.`), onError: (e) => showApiError(e) })}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                    {!item.active && canEdit && (
                      <ActionIcon variant="subtle" color="teal" aria-label={`Reactivate ${item.label}`} onClick={() => setActive.mutate({ id: item.id, active: true }, { onError: (e) => showApiError(e) })}>
                        <IconRestore size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
      {modal.open && <ItemModal key={modal.item?.id ?? 'new'} type={type} item={modal.item} onClose={() => setModal({ open: false, item: null })} />}
    </Card>
  )
}

/**
 * Small form built from the list's field definitions (plain state: fields differ per list).
 * Mounted fresh for each item (key), so its state starts from the item.
 */
function ItemModal({ type, item, onClose }: { type: ValueListType; item: ValueListItem | null; onClose: () => void }) {
  const save = useSaveValueListItem()
  const [label, setLabel] = useState(item?.label ?? '')
  const [code, setCode] = useState(item?.code ?? '')
  const [codeTouched, setCodeTouched] = useState(!!item)
  const [meta, setMeta] = useState<ValueListItem['meta']>(item?.meta ?? {})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const autoCode = (l: string) => l.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20)
  const submit = () => {
    const next: Record<string, string> = {}
    if (!label.trim()) next.label = 'Enter the label'
    const c = code || autoCode(label)
    if (!/^[A-Za-z0-9-]{1,20}$/.test(c)) next.code = 'Up to 20 letters, numbers or hyphens'
    setErrors(next)
    if (Object.keys(next).length) return
    save.mutate(
      { id: item?.id, type: type.key, input: { code: c, label: label.trim(), meta } },
      {
        onSuccess: (v) => {
          notifySaved(`${v.label} saved.`)
          onClose()
        },
        onError: (e) => {
          if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors)
          else showApiError(e)
        },
      },
    )
  }

  return (
    <Modal opened onClose={onClose} title={`${item ? 'Edit' : 'Add to'} ${type.label}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        noValidate
      >
        <Stack>
          <TextInput
            label="Label"
            withAsterisk
            data-autofocus
            value={label}
            onChange={(e) => {
              setLabel(e.currentTarget.value)
              if (!codeTouched) setCode(autoCode(e.currentTarget.value))
            }}
            error={errors.label}
          />
          <TextInput
            label="Code"
            description={item?.locked ? 'Used by the system; cannot change' : 'Short and stable; used in reports and imports'}
            readOnly={item?.locked}
            value={code}
            onChange={(e) => {
              setCode(e.currentTarget.value)
              setCodeTouched(true)
            }}
            error={errors.code}
          />
          {type.fields.map((f) =>
            f.type === 'number' ? (
              <NumberInput key={f.key} label={f.label} suffix={f.suffix ? ` ${f.suffix}` : undefined} min={0} allowDecimal={false} value={Number(meta[f.key] ?? 0)} onChange={(v) => setMeta((m) => ({ ...m, [f.key]: Number(v) || 0 }))} />
            ) : f.type === 'boolean' ? (
              <Switch key={f.key} label={f.label} checked={!!meta[f.key]} onChange={(e) => setMeta((m) => ({ ...m, [f.key]: e.currentTarget.checked }))} />
            ) : (
              <Select key={f.key} label={f.label} data={f.options} allowDeselect={false} value={String(meta[f.key] ?? f.options[0]?.value)} onChange={(v) => setMeta((m) => ({ ...m, [f.key]: v ?? '' }))} />
            ),
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
