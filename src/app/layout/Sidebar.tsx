import { Badge, NavLink, ScrollArea, Stack, Text } from '@mantine/core'
import { IconExternalLink } from '@tabler/icons-react'
import { NavLink as RouterNavLink } from 'react-router-dom'
import { usePermissions } from '@/auth/useCan'
import { filterMenu } from '../menu'
import { READY_SCREENS } from '../screens'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const perms = usePermissions()
  const groups = filterMenu((p) => perms.has(p))

  return (
    <ScrollArea type="never" style={{ flex: 1 }}>
      <Stack gap="md" p="sm" component="nav" aria-label="Main menu" data-tour="sidebar">
        {groups.map((group) => (
          <Stack key={group.key} gap={2}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" pb={4}>
              {group.label}
            </Text>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.key}
                  component={RouterNavLink}
                  to={item.path}
                  label={item.label}
                  leftSection={<Icon size={18} stroke={1.6} />}
                  target={item.fullScreen ? '_blank' : undefined}
                  data-tour={`nav-${item.key}`}
                  rightSection={
                    item.fullScreen ? (
                      <IconExternalLink size={14} stroke={1.6} />
                    ) : READY_SCREENS.has(item.key) ? null : (
                      <Badge size="xs" variant="light" color="gray">
                        step {item.step}
                      </Badge>
                    )
                  }
                  onClick={onNavigate}
                  styles={{ root: { borderRadius: 'var(--mantine-radius-sm)' } }}
                />
              )
            })}
          </Stack>
        ))}
      </Stack>
    </ScrollArea>
  )
}
