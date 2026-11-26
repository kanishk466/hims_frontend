import { Button, Group, Paper, Text } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useSession, useStopPreview } from '@/auth/queries'

/** Shown while an admin uses "See as this user". */
export function PreviewBanner() {
  const { data: session } = useSession()
  const stop = useStopPreview()
  const navigate = useNavigate()
  if (!session?.preview) return null
  const exit = () => {
    stop()
    navigate('/admin/users', { replace: true })
  }
  return (
    <Paper
      bg="orange.1"
      px="md"
      py={8}
      radius={0}
      role="status"
      style={{ position: 'sticky', top: 'var(--app-shell-header-height, 60px)', zIndex: 50, borderBottom: '1px solid var(--mantine-color-orange-4)', margin: 'calc(var(--mantine-spacing-lg) * -1) calc(var(--mantine-spacing-lg) * -1) var(--mantine-spacing-lg)' }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconEye size={18} color="var(--mantine-color-orange-8)" />
          <Text size="sm" c="orange.9">
            You are seeing the app as <b>{session.user.name}</b> ({session.roles.map((r) => r.name).join(', ')}). Menus and buttons are exactly theirs. Changes are turned off.
          </Text>
        </Group>
        <Button size="compact-sm" color="orange" onClick={exit}>
          Back to {session.preview.realUser.name}
        </Button>
      </Group>
    </Paper>
  )
}
