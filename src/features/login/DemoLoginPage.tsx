import { Alert, Anchor, Avatar, Badge, Card, Center, Container, Group, Kbd, Loader, Paper, SimpleGrid, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useDemoUsers, useLogin, useSession } from '@/auth/queries'
import { showApiError } from '@/lib/apiErrors'
import { initials } from '@/lib/text'
import type { DemoPersona, DemoUser } from '@/types/auth'
import { goPastLogin } from './goPastLogin'

const PERSONA_COLOR: Record<DemoPersona, string> = {
  superAdmin: 'grape',
  admin: 'indigo',
  frontOffice: 'blue',
  cashier: 'orange',
  nurse: 'pink',
  doctor: 'teal',
  accounts: 'yellow',
  md: 'red',
}

export function DemoLoginPage() {
  const { token, data: session } = useSession()
  const { data: users, isPending, isError } = useDemoUsers()
  const login = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const cards = (users ?? []).filter((u) => u.persona)
  const others = (users ?? []).filter((u) => !u.persona)

  const pick = (user: DemoUser) => {
    if (login.isPending || user.status !== 'active') return
    login.mutate(user.id, { onSuccess: (result) => goPastLogin(navigate, result, from), onError: (e) => showApiError(e) })
  }

  // Press 1–8 to log in as the matching card.
  useHotkeys(cards.slice(0, 9).map((u, i) => [String(i + 1), () => pick(u)]))

  if (token && session) return <Navigate to={from} replace />

  // Group the other users by clinic for the table below the cards.
  const byClinic = new Map<string, DemoUser[]>()
  for (const u of others) {
    const k = u.clinicName ?? 'Platform'
    byClinic.set(k, [...(byClinic.get(k) ?? []), u])
  }

  return (
    <Center mih="100vh" bg="gray.0" py="xl">
      <Container size={980} w="100%">
        <Stack gap="lg">
          <Anchor component={Link} to="/login" state={location.state} size="sm" w="fit-content">
            ← Sign in with username and password
          </Anchor>
          <Stack gap={4} ta="center">
            <Title order={1} fz={28}>
              Choose a demo user
            </Title>
            <Text c="dimmed">
              Each user has a different role, so you see different menus and buttons. Press <Kbd>1</Kbd>–<Kbd>8</Kbd> or click a card.
            </Text>
          </Stack>

          {isPending && (
            <Center py="xl">
              <Loader />
            </Center>
          )}
          {isError && (
            <Alert color="red" icon={<IconAlertTriangle />}>
              Could not load demo users. Try again in a moment.
            </Alert>
          )}

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {cards.map((u, i) => {
              const color = PERSONA_COLOR[u.persona!]
              return (
                <UnstyledButton
                  key={u.id}
                  onClick={() => pick(u)}
                  autoFocus={i === 1}
                  aria-label={`Log in as ${u.name}, ${u.roleNames.join(', ')}`}
                  style={{ borderRadius: 'var(--mantine-radius-md)' }}
                >
                  <Paper withBorder p="md" radius="md" h="100%" className="demo-user-card">
                    <Stack gap="sm" h="100%">
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap">
                          <Avatar color={color} radius="xl">
                            {initials(u.name)}
                          </Avatar>
                          <div>
                            <Text fw={600}>{u.name}</Text>
                            <Text size="xs" c="dimmed">
                              {u.designation}
                            </Text>
                          </div>
                        </Group>
                        <Kbd>{i + 1}</Kbd>
                      </Group>
                      <Group gap={6}>
                        {u.roleNames.map((r) => (
                          <Badge key={r} color={color} variant="light">
                            {r}
                          </Badge>
                        ))}
                        {u.clinicName && (
                          <Text size="xs" c="dimmed">
                            {u.clinicName}
                          </Text>
                        )}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {u.summary}
                      </Text>
                      {login.isPending && login.variables === u.id && <Loader size="xs" />}
                    </Stack>
                  </Paper>
                </UnstyledButton>
              )
            })}
          </SimpleGrid>

          {others.length > 0 && (
            <Card withBorder radius="md" p={0}>
              <Text fw={600} px="md" pt="sm">
                Other users
              </Text>
              <Text size="xs" c="dimmed" px="md" pb="xs">
                Users of other clinics, and people you invite while trying the demo.
              </Text>
              <Table highlightOnHover verticalSpacing={6}>
                <Table.Tbody>
                  {[...byClinic.entries()].flatMap(([clinic, list]) => [
                    <Table.Tr key={`h-${clinic}`} bg="gray.0">
                      <Table.Td colSpan={3}>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          {clinic}
                        </Text>
                      </Table.Td>
                    </Table.Tr>,
                    ...list.map((u) => (
                      <Table.Tr key={u.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {u.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {u.designation}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            {u.roleNames.map((r) => (
                              <Badge key={r} size="sm" variant="light" color="gray">
                                {r}
                              </Badge>
                            ))}
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right">
                          {u.status === 'invited' && u.inviteToken ? (
                            <Anchor component={Link} to={`/invite/${u.inviteToken}`} size="sm">
                              Accept invite
                            </Anchor>
                          ) : (
                            <Anchor component="button" size="sm" onClick={() => pick(u)} aria-label={`Log in as ${u.name}`}>
                              Log in
                            </Anchor>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    )),
                  ])}
                </Table.Tbody>
              </Table>
            </Card>
          )}

          <Text size="xs" c="dimmed">
            Picking a card skips the password. On the sign-in page every demo user’s password is demo@123.
          </Text>
        </Stack>
      </Container>
    </Center>
  )
}
