import { Badge, Button, Card, Group, Paper, SimpleGrid, Stack, Table, Text, ThemeIcon, UnstyledButton } from '@mantine/core'
import { IconCalendarPlus, IconCashRegister, IconHeartbeat, IconUserPlus } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { ACTION_LABELS, ACTIONS, PERMISSION_CATALOGUE, type Permission } from '@/auth/permissions'
import { useSession } from '@/auth/queries'
import { usePermissions } from '@/auth/useCan'
import { filterMenu } from '@/app/menu'
import { PageHeader } from '@/components/PageHeader'
import { formatLongDate, greeting } from '@/lib/dates'
import { useNow } from '@/lib/useNow'
import { MdDashboard } from '@/features/reports/MdDashboard'
import { GettingStartedCard } from '@/features/gettingStarted/GettingStartedCard'
import { useAutoStartTour } from '@/features/tour/useAutoStartTour'

export function DashboardPage() {
  const { data: session } = useSession()
  const perms = usePermissions()
  const now = useNow()
  useAutoStartTour()
  if (!session) return null

  const shortcuts = filterMenu((p) => perms.has(p))
    .flatMap((g) => g.items)
    .filter((i) => i.key !== 'dashboard')

  const accessRows = PERMISSION_CATALOGUE.flatMap((m) =>
    m.screens
      .map((s) => ({
        key: `${m.module}.${s.key}`,
        module: m.label,
        screen: s.label,
        actions: ACTIONS.filter((a) => perms.has(`${m.module}.${s.key}.${a}` as Permission)),
      }))
      .filter((r) => r.actions.length > 0),
  )

  return (
    <Stack gap="lg">
      <PageHeader
        title={`${greeting(now)}, ${session.user.name.split(' ').slice(0, 2).join(' ')}`}
        subtitle={`${formatLongDate(now)} · ${session.clinic?.name ?? ''} · ${session.roles.map((r) => r.name).join(', ')}`}
        actions={
          <>
            <Can permission="opd.registration.create">
              <Button component={Link} to="/opd/patients" leftSection={<IconUserPlus size={16} />}>
                Register patient
              </Button>
            </Can>
            <Can permission="opd.appointments.create">
              <Button component={Link} to="/opd/appointments" variant="light" leftSection={<IconCalendarPlus size={16} />}>
                Book appointment
              </Button>
            </Can>
            <Can permission="opd.billing.create">
              <Button component={Link} to="/opd/billing" leftSection={<IconCashRegister size={16} />}>
                New bill
              </Button>
            </Can>
            <Can permission="opd.vitals.create">
              <Button component={Link} to="/opd/vitals" variant="light" leftSection={<IconHeartbeat size={16} />}>
                Record vitals
              </Button>
            </Can>
          </>
        }
      />

      <GettingStartedCard />

      <MdDashboard />

      <Stack gap="xs">
        <Text fw={600}>Go to</Text>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
          {shortcuts.map((item) => {
            const Icon = item.icon
            return (
              <UnstyledButton key={item.key} component={Link} to={item.path} target={item.fullScreen ? '_blank' : undefined}>
                <Paper withBorder p="sm" radius="md">
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon variant="light" size="lg">
                      <Icon size={20} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>
                      {item.label}
                    </Text>
                  </Group>
                </Paper>
              </UnstyledButton>
            )
          })}
        </SimpleGrid>
      </Stack>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Your access</Text>
          <Text size="xs" c="dimmed">
            {perms.size} permissions from {session.roles.map((r) => r.name).join(', ')}
          </Text>
        </Group>
        <Table striped highlightOnHover verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Area</Table.Th>
              <Table.Th>Screen</Table.Th>
              <Table.Th>You can</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {accessRows.map((r) => (
              <Table.Tr key={r.key}>
                <Table.Td c="dimmed">{r.module}</Table.Td>
                <Table.Td>{r.screen}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {r.actions.map((a) => (
                      <Badge key={a} size="sm" variant={a === 'view' ? 'outline' : 'light'}>
                        {ACTION_LABELS[a]}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  )
}
