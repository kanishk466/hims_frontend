import { Alert, Anchor, Button, CopyButton, Group, Modal, Stack, Text, TextInput, ThemeIcon, Timeline } from '@mantine/core'
import { IconCheck, IconInfoCircle } from '@tabler/icons-react'
import { formatDateTime } from '@/lib/dates'
import { inviteUrl } from '@/lib/invite'
import type { ProvisionResult } from '@/types/clinic'

/** Shown after "Create clinic": what provisioning did, and the admin's invite link. */
export function ProvisionResultModal({ result, onClose }: { result: ProvisionResult | null; onClose: () => void }) {
  const link = result ? inviteUrl(result.inviteToken) : ''
  return (
    <Modal opened={!!result} onClose={onClose} title={result ? `${result.clinic.name} is ready` : ''} size="lg">
      {result && (
        <Stack gap="md">
          <Timeline active={result.steps.length} bulletSize={22} lineWidth={2} color="teal">
            {result.steps.map((s) => (
              <Timeline.Item
                key={s.label}
                title={s.label}
                bullet={
                  <ThemeIcon size={22} radius="xl" color="teal">
                    <IconCheck size={14} />
                  </ThemeIcon>
                }
              >
                <Text size="sm" c="dimmed">
                  {s.detail}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>

          <Stack gap={6}>
            <Text fw={600}>Invite link for {result.clinic.admin?.name}</Text>
            <Group gap="xs" wrap="nowrap">
              <TextInput value={link} readOnly style={{ flex: 1 }} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={link}>
                {({ copied, copy }) => (
                  <Button variant={copied ? 'light' : 'default'} onClick={copy} data-autofocus>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Text size="xs" c="dimmed">
              Valid until {formatDateTime(result.inviteExpiresAt)}.{' '}
              <Anchor href={`/invite/${result.inviteToken}`} target="_blank" size="xs">
                Open invite in a new tab (demo)
              </Anchor>
            </Text>
          </Stack>

          <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
            Demo: no email is sent. Open the link to accept the invite as the admin, or find them under “Other users” on the login screen.
          </Alert>

          <Group justify="flex-end">
            <Button onClick={onClose}>Done</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
