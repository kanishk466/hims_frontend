import { Group, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  /** Buttons on the right; wrap each in <Can>. */
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap">
      <Stack gap={2}>
        <Title order={2} fz="h3">
          {title}
        </Title>
        {subtitle && (
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        )}
      </Stack>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  )
}
