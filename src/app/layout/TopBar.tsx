import { Avatar, Burger, Group, Kbd, Menu, Text, UnstyledButton } from '@mantine/core'
import { spotlight } from '@mantine/spotlight'
import { IconChecklist, IconChevronDown, IconEyeOff, IconLogout, IconMapRoute, IconSearch, IconShieldLock, IconSwitchHorizontal } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogout, useSession, useStopPreview } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { MfaSettingsModal } from '@/features/account/MfaSettingsModal'
import { useShowGettingStarted } from '@/features/gettingStarted/queries'
import { useTourStore } from '@/features/tour/tourStore'
import { formatLongDate } from '@/lib/dates'
import { initials } from '@/lib/text'
import { useNow } from '@/lib/useNow'

export function TopBar({ navOpened, toggleNav }: { navOpened: boolean; toggleNav: () => void }) {
  const { data: session } = useSession()
  const logout = useLogout()
  const stopPreview = useStopPreview()
  const navigate = useNavigate()
  const now = useNow()
  const startTour = useTourStore((s) => s.start)
  const canSetup = useCan('admin.setup.edit')
  const showGettingStarted = useShowGettingStarted()
  const [mfaOpen, setMfaOpen] = useState(false)
  if (!session) return null

  // Explicit logout lands on the login page with no "return to" page, so the next user starts at their home.
  // The top bar unmounts as soon as the token is cleared, so await the promise rather than using
  // mutate callbacks. The login page then opens with no "return to" page and the next user starts at home.
  const leave = async (to: '/login' | '/login/demo') => {
    await logout.mutateAsync().catch(() => undefined)
    navigate(to, { replace: true, state: null })
  }

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap">
        <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" aria-label="Toggle menu" />
        <Text fw={700} size="lg" c="teal.8">
          {session.clinic?.name ?? 'HMS Platform'}
        </Text>
        {session.clinic && (
          <Text c="dimmed" size="sm" visibleFrom="md">
            {session.clinic.city}
          </Text>
        )}
      </Group>

      <UnstyledButton
        onClick={() => spotlight.open()}
        visibleFrom="sm"
        aria-label="Search (Ctrl+K)"
        data-tour="search"
        style={{
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-md)',
          padding: '6px 10px',
          minWidth: 280,
          background: 'var(--mantine-color-gray-0)',
        }}
      >
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <IconSearch size={16} color="var(--mantine-color-gray-6)" />
            <Text size="sm" c="dimmed">
              Search screens…
            </Text>
          </Group>
          <Group gap={2} wrap="nowrap">
            <Kbd size="xs">Ctrl</Kbd>
            <Kbd size="xs">K</Kbd>
          </Group>
        </Group>
      </UnstyledButton>

      <Group gap="md" wrap="nowrap">
        <Text size="sm" c="dimmed" visibleFrom="lg">
          {formatLongDate(now)}
        </Text>
        <Menu position="bottom-end" width={240} withinPortal>
          <Menu.Target>
            <UnstyledButton aria-label="User menu" data-tour="user-menu">
              <Group gap={8} wrap="nowrap">
                <Avatar color="teal" radius="xl" size={34}>
                  {initials(session.user.name)}
                </Avatar>
                <div style={{ lineHeight: 1.2 }}>
                  <Text size="sm" fw={600}>
                    {session.user.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {session.user.isSuperAdmin ? 'Super Admin' : session.roles.map((r) => r.name).join(', ')}
                  </Text>
                </div>
                <IconChevronDown size={14} />
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{session.user.designation}</Menu.Label>
            {session.preview && (
              <Menu.Item
                leftSection={<IconEyeOff size={16} />}
                color="orange"
                onClick={() => {
                  stopPreview()
                  navigate('/admin/users', { replace: true })
                }}
              >
                Back to {session.preview.realUser.name}
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconMapRoute size={16} />} onClick={startTour}>
              Show the tour
            </Menu.Item>
            {canSetup && !session.preview && (
              <Menu.Item
                leftSection={<IconChecklist size={16} />}
                onClick={async () => {
                  await showGettingStarted()
                  navigate('/dashboard')
                }}
              >
                Getting started
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconShieldLock size={16} />} onClick={() => setMfaOpen(true)}>
              Two-factor authentication
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item leftSection={<IconSwitchHorizontal size={16} />} onClick={() => leave('/login/demo')}>
              Switch user
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={() => leave('/login')}>
              Log out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {mfaOpen && <MfaSettingsModal onClose={() => setMfaOpen(false)} />}
    </Group>
  )
}
