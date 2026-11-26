import { Card, SimpleGrid, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core'
import { IconChartBar } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import type { Permission } from '@/auth/permissions'
import { usePermissions } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { REPORTS } from '@/types/reports'

/** OPD Spec screen 14: the reports this user may open. */
export function ReportsPage() {
  const perms = usePermissions()
  const mine = REPORTS.filter((r) => perms.has(`reports.${r.key}.view` as Permission))
  return (
    <Stack gap="lg">
      <PageHeader title="Reports" subtitle="Pick a report; every one can be filtered by date, doctor and department, exported to Excel and printed." />
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {mine.map((r) => (
          <UnstyledButton key={r.key} component={Link} to={`/reports/${r.key}`}>
            <Card withBorder radius="md" h="100%">
              <ThemeIcon variant="light" size="lg" mb="sm">
                <IconChartBar size={18} />
              </ThemeIcon>
              <Text fw={600}>{r.title}</Text>
              <Text size="sm" c="dimmed">
                {r.description}
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                {r.audience}
              </Text>
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
