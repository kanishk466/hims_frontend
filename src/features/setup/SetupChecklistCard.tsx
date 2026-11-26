import { Button, Card, Group, Progress, SimpleGrid, Text, ThemeIcon } from '@mantine/core'
import { IconArrowRight, IconCheck, IconCircleDashed } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { useSetupProgress } from './queries'

/** Onboarding checklist on the admin dashboard until setup is finished. */
export function SetupChecklistCard() {
  const { data: session } = useSession()
  const canSetup = useCan('admin.setup.view')
  const show = canSetup && !!session?.clinic && !session.clinic.setupComplete
  const { data: progress } = useSetupProgress(show)
  if (!show || !progress) return null
  const required = progress.steps.filter((s) => s.required)
  const next = required.find((s) => !s.done)

  return (
    <Card withBorder radius="md" padding="md" style={{ borderColor: 'var(--mantine-color-blue-3)' }}>
      <Group justify="space-between" mb="xs">
        <div>
          <Text fw={600}>Finish setting up {session!.clinic!.name}</Text>
          <Text size="sm" c="dimmed">
            {progress.requiredDone} of {progress.requiredTotal} required steps done
          </Text>
        </div>
        <Button component={Link} to={next ? `/admin/setup?step=${next.key}` : '/admin/setup?step=finish'} rightSection={<IconArrowRight size={16} />}>
          {next ? `Continue: ${next.label}` : 'Finish setup'}
        </Button>
      </Group>
      <Progress value={(progress.requiredDone / progress.requiredTotal) * 100} mb="sm" />
      <SimpleGrid cols={{ base: 1, sm: 5 }} spacing="xs">
        {required.map((s) => (
          <Group key={s.key} gap={6} wrap="nowrap">
            <ThemeIcon size={20} radius="xl" color={s.done ? 'teal' : 'gray'} variant={s.done ? 'filled' : 'light'}>
              {s.done ? <IconCheck size={12} /> : <IconCircleDashed size={12} />}
            </ThemeIcon>
            <Text size="sm">{s.label}</Text>
          </Group>
        ))}
      </SimpleGrid>
    </Card>
  )
}
