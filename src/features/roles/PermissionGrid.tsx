import { Checkbox, Group, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { Fragment } from 'react'
import { ACTION_LABELS, describePermission, type Action, type Permission } from '@/auth/permissions'
import { ACTIONS, code, columnState, GRID, moduleCount, rowState, toggleCell, toggleModuleColumn, toggleRow } from './grid'

interface Props {
  value: ReadonlySet<Permission>
  onChange: (next: Set<Permission>) => void
  readOnly: boolean
  collapsed: ReadonlySet<string>
  onToggleModule: (module: string) => void
}

/**
 * Rows = screens grouped by module (collapsible), columns = actions.
 * Blank cell = the action does not exist on that screen.
 */
export function PermissionGrid({ value, onChange, readOnly, collapsed, onToggleModule }: Props) {
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table verticalSpacing={6} withRowBorders aria-label="Permission grid">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Screen</Table.Th>
            {ACTIONS.map((a) => (
              <Table.Th key={a} ta="center" w={78}>
                {ACTION_LABELS[a]}
              </Table.Th>
            ))}
            <Table.Th ta="center" w={60}>
              All
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {GRID.map((mod) => {
            const open = !collapsed.has(mod.module)
            const count = moduleCount(value, mod)
            return (
              <Fragment key={mod.module}>
                <Table.Tr bg="gray.0">
                  <Table.Td>
                    <UnstyledButton onClick={() => onToggleModule(mod.module)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${mod.label}`}>
                      <Group gap={6} wrap="nowrap">
                        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                        <Text fw={700} size="sm">
                          {mod.label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {count.on} of {count.total}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  </Table.Td>
                  {ACTIONS.map((a) => {
                    const st = columnState(value, mod, a)
                    return (
                      <Table.Td key={a} ta="center">
                        {st !== 'na' && (
                          <Tooltip label={`${ACTION_LABELS[a]} on every ${mod.label} screen`} openDelay={400}>
                            <Checkbox
                              size="xs"
                              variant="outline"
                              styles={{ body: { justifyContent: 'center' } }}
                              checked={st === 'all'}
                              indeterminate={st === 'some'}
                              disabled={readOnly}
                              onChange={() => onChange(toggleModuleColumn(value, mod, a, st !== 'all'))}
                              aria-label={`${ACTION_LABELS[a]} on all ${mod.label} screens`}
                            />
                          </Tooltip>
                        )}
                      </Table.Td>
                    )
                  })}
                  <Table.Td />
                </Table.Tr>
                {open &&
                  mod.screens.map((s) => {
                    const rs = rowState(value, s)
                    return (
                      <Table.Tr key={s.key}>
                        <Table.Td pl={34}>
                          <Text size="sm">{s.label}</Text>
                        </Table.Td>
                        {ACTIONS.map((a: Action) => (
                          <Table.Td key={a} ta="center">
                            {s.actions.includes(a) && (
                              <Checkbox
                                styles={{ body: { justifyContent: 'center' } }}
                                checked={value.has(code(s, a))}
                                disabled={readOnly}
                                onChange={(e) => onChange(toggleCell(value, s, a, e.currentTarget.checked))}
                                aria-label={describePermission(code(s, a))}
                              />
                            )}
                          </Table.Td>
                        ))}
                        <Table.Td ta="center">
                          <Checkbox
                              size="xs"
                              variant="outline"
                              styles={{ body: { justifyContent: 'center' } }}
                              checked={rs === 'all'}
                              indeterminate={rs === 'some'}
                              disabled={readOnly}
                              onChange={() => onChange(toggleRow(value, s, rs !== 'all'))}
                              aria-label={`All actions on ${s.label}`}
                            />
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
              </Fragment>
            )
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
