import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Anchor, Badge, Button, CopyButton, Group, Image, List, Loader, Modal, PasswordInput, PinInput, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconCopy } from '@tabler/icons-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { isApiError } from '@/api/client'
import { useMfaSelfConfirm, useMfaSelfDisable, useMfaSelfEnroll, useMfaStatus } from '@/auth/queries'
import { mfaCodeSchema, mfaDisableSchema, type MfaCodeInput, type MfaDisableInput } from '@/types/auth'

/**
 * Self-service: turn TOTP on or off voluntarily. Reached from the user menu. For accounts where
 * MFA is mandatory (isSuperAdmin, or a role holding admin.users.edit) this only shows status —
 * there is no self-service way to turn mandatory MFA off.
 */
export function MfaSettingsModal({ onClose }: { onClose: () => void }) {
  const status = useMfaStatus()
  const enroll = useMfaSelfEnroll()
  const confirm = useMfaSelfConfirm()
  const disable = useMfaSelfDisable()
  const [enrolling, setEnrolling] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  const codeForm = useForm<MfaCodeInput>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: '' } })
  const disableForm = useForm<MfaDisableInput>({ resolver: zodResolver(mfaDisableSchema), defaultValues: { password: '' } })

  const startEnroll = () => {
    setEnrolling(true)
    enroll.mutate(undefined)
  }

  const submitConfirm = codeForm.handleSubmit((input) =>
    confirm.mutate(input.code, {
      onSuccess: ({ recoveryCodes }) => setRecoveryCodes(recoveryCodes),
      onError: () => codeForm.setFocus('code'),
    }),
  )

  const submitDisable = disableForm.handleSubmit((input) =>
    disable.mutate(input.password, {
      onSuccess: () => setDisabling(false),
      onError: () => disableForm.setFocus('password'),
    }),
  )

  const close = () => {
    // Leaving mid-setup abandons the pending secret server-side next time they start again — fine.
    status.refetch()
    onClose()
  }

  return (
    <Modal opened onClose={close} title="Two-factor authentication">
      {status.isPending && (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      )}
      {status.isError && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          <Text size="sm">Could not load your two-factor status.</Text>
        </Alert>
      )}

      {status.data && !enrolling && !recoveryCodes && (
        <Stack>
          <Group justify="space-between">
            <Text size="sm">Status</Text>
            <Badge color={status.data.enabled ? 'teal' : 'gray'} variant="light">
              {status.data.enabled ? 'On' : 'Off'}
            </Badge>
          </Group>
          {status.data.required && (
            <Text size="xs" c="dimmed">
              Two-factor authentication is required for your role and cannot be turned off here.
            </Text>
          )}
          {!status.data.enabled && (
            <Button onClick={startEnroll} loading={enroll.isPending}>
              Turn on two-factor authentication
            </Button>
          )}
          {status.data.enabled && !status.data.required && !disabling && (
            <Button color="red" variant="light" onClick={() => setDisabling(true)}>
              Turn off two-factor authentication
            </Button>
          )}
          {status.data.enabled && disabling && (
            <form onSubmit={submitDisable} noValidate>
              <Stack>
                <PasswordInput label="Confirm your password" autoFocus autoComplete="current-password" {...disableForm.register('password')} error={disableForm.formState.errors.password?.message} />
                {disable.error && (
                  <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                    <Text size="sm">{isApiError(disable.error) ? disable.error.message : 'Could not turn it off.'}</Text>
                  </Alert>
                )}
                <Group justify="flex-end">
                  <Button variant="default" onClick={() => setDisabling(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" color="red" loading={disable.isPending}>
                    Turn off
                  </Button>
                </Group>
              </Stack>
            </form>
          )}
        </Stack>
      )}

      {enrolling && !recoveryCodes && (
        <form onSubmit={submitConfirm} noValidate>
          <Stack>
            <Text size="sm" c="dimmed">
              Scan this code with an authenticator app (Google Authenticator, Authy, 1Password, etc).
            </Text>
            {enroll.isPending && (
              <Group justify="center" py="md">
                <Loader size="sm" />
              </Group>
            )}
            {enroll.isError && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                <Text size="sm">Could not start enrollment. Try again.</Text>
              </Alert>
            )}
            {enroll.data && (
              <Stack align="center" gap={4}>
                <Image src={enroll.data.qrCodeDataUrl} alt="Scan with your authenticator app" w={180} h={180} fit="contain" />
                <Group gap={6} wrap="nowrap">
                  <Text size="xs" c="dimmed">
                    Can't scan it? Enter this code manually:
                  </Text>
                  <Tooltip label="Copy">
                    <CopyButton value={enroll.data.secret}>{({ copy }) => (
                      <Anchor component="button" type="button" size="xs" ff="monospace" onClick={copy}>
                        {enroll.data?.secret}
                      </Anchor>
                    )}</CopyButton>
                  </Tooltip>
                </Group>
                <Controller
                  control={codeForm.control}
                  name="code"
                  render={({ field }) => (
                    <Stack gap={4} align="center" pt="sm">
                      <Text size="sm" fw={500}>
                        Enter the 6-digit code
                      </Text>
                      <PinInput length={6} type="number" oneTimeCode value={field.value} onChange={field.onChange} aria-label="6-digit code" autoFocus error={!!codeForm.formState.errors.code} />
                      {codeForm.formState.errors.code && (
                        <Text size="xs" c="red">
                          {codeForm.formState.errors.code.message}
                        </Text>
                      )}
                    </Stack>
                  )}
                />
              </Stack>
            )}
            {confirm.error && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                <Text size="sm">{isApiError(confirm.error) ? confirm.error.message : 'Could not confirm that code.'}</Text>
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEnrolling(false)}>
                Cancel
              </Button>
              {enroll.data && (
                <Button type="submit" loading={confirm.isPending}>
                  Confirm and turn on
                </Button>
              )}
            </Group>
          </Stack>
        </form>
      )}

      {recoveryCodes && (
        <Stack>
          <Alert color="teal" variant="light" icon={<IconCheck size={16} />} title="Two-factor authentication is on">
            <Text size="sm">Save these recovery codes somewhere safe — if you lose your phone, each one signs you in once instead of a 6-digit code. They will not be shown again.</Text>
          </Alert>
          <List size="sm" spacing={4} ff="monospace">
            {recoveryCodes.map((code) => (
              <List.Item key={code}>{code}</List.Item>
            ))}
          </List>
          <Group justify="space-between">
            <CopyButton value={recoveryCodes.join('\n')}>
              {({ copied, copy }) => (
                <Button variant="default" size="sm" leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} onClick={copy}>
                  {copied ? 'Copied' : 'Copy codes'}
                </Button>
              )}
            </CopyButton>
            <Button size="sm" onClick={close}>
              I've saved these, done
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
