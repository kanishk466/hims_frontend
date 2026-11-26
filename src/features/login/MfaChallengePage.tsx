import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Anchor, Button, Center, CopyButton, Group, Image, List, Paper, PinInput, Stack, Text, TextInput, ThemeIcon, Title, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconCopy, IconDeviceMobile, IconShieldLock } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { useMfaConfirm, useMfaEnroll, useMfaRecover, useMfaVerify, useSession } from '@/auth/queries'
import { mfaCodeSchema, mfaRecoveryCodeSchema, type MfaCodeInput, type MfaRecoveryCodeInput } from '@/types/auth'

interface ChallengeState {
  mfaToken: string
  enrollment: boolean
  from?: string
}

/**
 * Reached only mid-login, when login-password/login/reset-password/accept-invite returned
 * `{mfaRequired: true}`. The mfaToken (and whether this account still needs to enroll) comes
 * from router state set by the screen that navigated here — never from the URL, so a bookmark
 * or refresh just sends the user back to start login again (the token is short-lived anyway).
 */
export function MfaChallengePage() {
  const { token, data: session } = useSession()
  const location = useLocation()
  const state = location.state as ChallengeState | null
  const from = state?.from ?? '/'

  if (token && session) return <Navigate to={from} replace />
  if (!state?.mfaToken) return <Navigate to="/login" replace />

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Stack w={440} maw="100%" gap="lg">
        <Group gap="sm" justify="center">
          <ThemeIcon size={40} radius="md" color="teal">
            <IconShieldLock size={24} />
          </ThemeIcon>
          <div>
            <Title order={2} fz={22}>
              Two-factor authentication
            </Title>
            <Text size="xs" c="dimmed">
              Required for your account
            </Text>
          </div>
        </Group>
        <Paper withBorder radius="md" p="xl" shadow="xs">
          {state.enrollment ? <EnrollStep mfaToken={state.mfaToken} from={from} /> : <VerifyStep mfaToken={state.mfaToken} from={from} />}
        </Paper>
      </Stack>
    </Center>
  )
}

/** First-time setup: show the QR code, confirm a code, then show the recovery codes once. */
function EnrollStep({ mfaToken, from }: { mfaToken: string; from: string }) {
  const navigate = useNavigate()
  const enroll = useMfaEnroll()
  const confirm = useMfaConfirm()
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const { control, handleSubmit, formState, setFocus } = useForm<MfaCodeInput>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: '' } })

  useEffect(() => {
    enroll.mutate(mfaToken)
    // Only ever enroll once per mount — re-running would ask the server for a fresh secret
    // and invalidate whatever the user already scanned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = handleSubmit((input) =>
    confirm.mutate(
      { mfaToken, code: input.code },
      {
        onSuccess: ({ recoveryCodes }) => setRecoveryCodes(recoveryCodes),
        onError: () => setFocus('code'),
      },
    ),
  )

  if (recoveryCodes) {
    return (
      <Stack>
        <Alert color="teal" variant="light" icon={<IconCheck size={16} />} title="Two-factor authentication is on">
          <Text size="sm">Save these recovery codes somewhere safe — if you lose your phone, each one signs you in once instead of a 6-digit code. They will not be shown again.</Text>
        </Alert>
        <Paper withBorder radius="sm" p="sm" bg="gray.0">
          <List size="sm" spacing={4} ff="monospace" center={false}>
            {recoveryCodes.map((code) => (
              <List.Item key={code}>{code}</List.Item>
            ))}
          </List>
        </Paper>
        <Group justify="space-between">
          <CopyButton value={recoveryCodes.join('\n')}>
            {({ copied, copy }) => (
              <Button variant="default" size="sm" leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} onClick={copy}>
                {copied ? 'Copied' : 'Copy codes'}
              </Button>
            )}
          </CopyButton>
          <Button size="sm" onClick={() => navigate(from, { replace: true })}>
            I've saved these, continue
          </Button>
        </Group>
      </Stack>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <Text size="sm" c="dimmed">
          Scan this code with an authenticator app (Google Authenticator, Authy, 1Password, etc).
        </Text>
        {enroll.isPending && (
          <Center py="xl">
            <Text size="sm" c="dimmed">
              Preparing your code…
            </Text>
          </Center>
        )}
        {enroll.isError && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">{isApiError(enroll.error) ? enroll.error.message : 'Could not start enrollment. Go back and sign in again.'}</Text>
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
          </Stack>
        )}
        {enroll.data && (
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <Stack gap={4} align="center">
                <Text size="sm" fw={500} ta="center">
                  Enter the 6-digit code from the app
                </Text>
                <PinInput length={6} type="number" oneTimeCode value={field.value} onChange={field.onChange} aria-label="6-digit code" autoFocus error={!!formState.errors.code} />
                {formState.errors.code && (
                  <Text size="xs" c="red">
                    {formState.errors.code.message}
                  </Text>
                )}
              </Stack>
            )}
          />
        )}
        {confirm.error && isApiError(confirm.error) && confirm.error.code !== 'invalid_totp' && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">{confirm.error.message}</Text>
          </Alert>
        )}
        {enroll.data && (
          <Button type="submit" size="md" loading={confirm.isPending} fullWidth>
            Confirm and turn on
          </Button>
        )}
      </Stack>
    </form>
  )
}

/** Every login after enrollment: a 6-digit code, or a recovery code for a lost device. */
function VerifyStep({ mfaToken, from }: { mfaToken: string; from: string }) {
  const navigate = useNavigate()
  const verify = useMfaVerify()
  const recover = useMfaRecover()
  const [useRecovery, setUseRecovery] = useState(false)
  const codeForm = useForm<MfaCodeInput>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: '' } })
  const recoveryForm = useForm<MfaRecoveryCodeInput>({ resolver: zodResolver(mfaRecoveryCodeSchema), defaultValues: { recoveryCode: '' } })

  const submitCode = codeForm.handleSubmit((input) =>
    verify.mutate(
      { mfaToken, code: input.code },
      { onSuccess: () => navigate(from, { replace: true }), onError: () => codeForm.setFocus('code') },
    ),
  )
  const submitRecovery = recoveryForm.handleSubmit((input) =>
    recover.mutate(
      { mfaToken, recoveryCode: input.recoveryCode },
      { onSuccess: () => navigate(from, { replace: true }), onError: () => recoveryForm.setFocus('recoveryCode') },
    ),
  )

  const error = useRecovery ? recover.error : verify.error
  const pending = useRecovery ? recover.isPending : verify.isPending

  if (useRecovery) {
    return (
      <form onSubmit={submitRecovery} noValidate>
        <Stack>
          <Text size="sm" c="dimmed">
            Enter one of the recovery codes you saved when you set up two-factor authentication. Each one works once.
          </Text>
          <TextInput placeholder="e.g. A1B2C3D4E5" ff="monospace" autoFocus autoComplete="one-time-code" {...recoveryForm.register('recoveryCode')} error={recoveryForm.formState.errors.recoveryCode?.message} />
          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm">{isApiError(error) ? error.message : 'Could not verify that code.'}</Text>
            </Alert>
          )}
          <Button type="submit" size="md" loading={pending} fullWidth>
            Sign in with recovery code
          </Button>
          <Anchor component="button" type="button" size="sm" ta="center" onClick={() => setUseRecovery(false)}>
            Use the authenticator app instead
          </Anchor>
        </Stack>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} noValidate>
      <Stack>
        <Group gap={6} justify="center">
          <IconDeviceMobile size={16} />
          <Text size="sm" c="dimmed">
            Enter the 6-digit code from your authenticator app
          </Text>
        </Group>
        <Controller
          control={codeForm.control}
          name="code"
          render={({ field }) => (
            <Stack gap={4} align="center">
              <PinInput length={6} type="number" oneTimeCode value={field.value} onChange={field.onChange} aria-label="6-digit code" autoFocus error={!!codeForm.formState.errors.code} />
              {codeForm.formState.errors.code && (
                <Text size="xs" c="red">
                  {codeForm.formState.errors.code.message}
                </Text>
              )}
            </Stack>
          )}
        />
        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">{isApiError(error) ? error.message : 'Could not verify that code.'}</Text>
          </Alert>
        )}
        <Button type="submit" size="md" loading={pending} fullWidth>
          Verify
        </Button>
        <Anchor component="button" type="button" size="sm" ta="center" onClick={() => setUseRecovery(true)}>
          Lost your phone? Use a recovery code
        </Anchor>
      </Stack>
    </form>
  )
}
