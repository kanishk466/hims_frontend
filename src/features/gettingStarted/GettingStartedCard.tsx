import { Badge, Button, Card, CloseButton, Grid, Group, Progress, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { IconArrowRight, IconCheck, IconCircleDashed } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { showApiError } from '@/lib/apiErrors'
import type { GettingStartedItem } from '@/types/gettingStarted'
import { useTourStore } from '../tour/tourStore'
import { useGettingStarted, useHideGettingStarted, useMarkRolesReviewed } from './queries'

/**
 * Clinic admin's checklist on the dashboard: first the setup wizard steps, then the checks before
 * staff start using the system. Items tick themselves from the data; "Hide" puts it away
 * (user menu → Getting started brings it back).
 */
export function GettingStartedCard() {
  const { data: session } = useSession()
  const canView = useCan('admin.setup.view')
  const canEdit = useCan('admin.setup.edit')
  const show = canView && !!session?.clinic && !session.preview
  const { data } = useGettingStarted(show)
  const hide = useHideGettingStarted()
  const reviewed = useMarkRolesReviewed()
  const startTour = useTourStore((s) => s.start)
  if (!show || !data || data.hidden) return null

  const next = data.items.find((i) => !i.done)
  const allDone = !next
  const open = (i: GettingStartedItem) =>
    i.key === 'tour' ? (
      <Button size="compact-sm" variant="light" onClick={startTour}>
        Start
      </Button>
    ) : (
      <Button size="compact-sm" variant="light" component={Link} to={i.path}>
        Open
      </Button>
    )

  const list = (group: GettingStartedItem['group'], title: string) => (
    <Stack gap={8}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        {title}
      </Text>
      {data.items
        .filter((i) => i.group === group)
        .map((i) => (
          <Group key={i.key} justify="space-between" wrap="nowrap" align="flex-start" aria-label={`${i.label}: ${i.done ? 'done' : 'to do'}`}>
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon size={22} radius="xl" color={i.done ? 'teal' : 'gray'} variant={i.done ? 'filled' : 'light'} mt={1}>
                {i.done ? <IconCheck size={13} /> : <IconCircleDashed size={13} />}
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500} c={i.done ? 'dimmed' : undefined}>
                  {i.label}
                </Text>
                {!i.done && (
                  <Text size="xs" c="dimmed">
                    {i.hint}
                  </Text>
                )}
              </div>
            </Group>
            {!i.done && (
              <Group gap={6} wrap="nowrap">
                {i.manual && canEdit && (
                  <Tooltip label="Tick this if the default permissions suit you">
                    <Button size="compact-sm" variant="subtle" loading={reviewed.isPending} onClick={() => reviewed.mutate(undefined, { onError: (e) => showApiError(e) })}>
                      Looks fine
                    </Button>
                  </Tooltip>
                )}
                {open(i)}
              </Group>
            )}
          </Group>
        ))}
    </Stack>
  )

  return (
    <Card withBorder radius="md" padding="md" style={{ borderColor: allDone ? 'var(--mantine-color-teal-3)' : 'var(--mantine-color-blue-3)' }} data-tour="getting-started" aria-label="Getting started">
      <Group justify="space-between" mb="xs" wrap="nowrap" align="flex-start">
        <div>
          <Group gap="xs">
            <Text fw={600}>{allDone ? `${session!.clinic!.name} is ready to go` : `Getting started with ${session!.clinic!.name}`}</Text>
            <Badge variant="light" color={allDone ? 'teal' : 'blue'}>
              {data.done} of {data.total}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {allDone ? 'Everything is set. You can hide this card; it stays in your user menu.' : 'Work down the list. Each line opens the right screen and ticks itself when done.'}
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          {next &&
            (next.key === 'tour' ? (
              <Button rightSection={<IconArrowRight size={16} />} onClick={startTour}>
                Next: {next.label}
              </Button>
            ) : (
              <Button component={Link} to={next.path} rightSection={<IconArrowRight size={16} />}>
                Next: {next.label}
              </Button>
            ))}
          {canEdit && <CloseButton aria-label="Hide getting started" title="Hide (bring it back from your user menu)" onClick={() => hide.mutate(true)} />}
        </Group>
      </Group>
      <Progress value={(data.done / data.total) * 100} mb="md" color={allDone ? 'teal' : 'blue'} />
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 5 }}>{list('setup', '1 · Set up')}</Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>{list('goLive', '2 · Before staff start')}</Grid.Col>
      </Grid>
    </Card>
  )
}
