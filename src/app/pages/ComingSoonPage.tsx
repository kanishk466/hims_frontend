import { Badge, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { PageHeader } from '@/components/PageHeader'
import type { MenuItem } from '../menu'

/** Placeholder for screens built in later steps, so menus and access can be reviewed now. */
export function ComingSoonPage({ item }: { item: MenuItem }) {
  const Icon = item.icon
  return (
    <Stack>
      <PageHeader title={item.label} />
      <Paper withBorder p="xl" radius="md">
        <Group align="flex-start" wrap="nowrap">
          <ThemeIcon size={48} radius="md" variant="light">
            <Icon size={28} />
          </ThemeIcon>
          <Stack gap={6}>
            <Group gap="xs">
              <Text fw={600}>Coming in step {item.step}</Text>
              <Badge variant="light" color="gray">
                placeholder
              </Badge>
            </Group>
            <Text c="dimmed">{item.description}</Text>
            <Text size="sm" c="dimmed">
              You can see this page because your role has <code>{item.permission}</code>.
            </Text>
          </Stack>
        </Group>
      </Paper>
    </Stack>
  )
}
