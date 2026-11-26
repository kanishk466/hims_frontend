import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Anchor, Badge, Button, Center, Group, Loader, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { acceptInvite, getInvite } from '@/api/auth'
import { isApiError } from '@/api/client'
import { useSessionStore } from '@/auth/sessionStore'
import { goPastLogin } from '@/features/login/goPastLogin'
import { showApiError } from '@/lib/apiErrors'
import { formatDateTime } from '@/lib/dates'
import { acceptInviteSchema, hasSessionToken, type AcceptInviteInput } from '@/types/auth'

/** Public page opened from the invite email: set a password and sign in. */
export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const setToken = useSessionStore((s) => s.setToken)
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => getInvite(token), retry: false })
  const accept = useMutation({ mutationFn: (input: AcceptInviteInput) => acceptInvite(token, input) })
  const { register, handleSubmit, formState, setError } = useForm<AcceptInviteInput>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const onSubmit = handleSubmit((values) =>
    accept.mutate(values, {
      onSuccess: (result) => {
        if (hasSessionToken(result)) {
          qc.removeQueries()
          setToken(result.token)
        }
        goPastLogin(navigate, result, '/')
      },
      onError: (e) => showApiError(e, setError),
    }),
  )

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Paper withBorder radius="md" p="xl" w={440} maw="100%">
        {invite.isPending && (
          <Center py="xl">
            <Loader />
          </Center>
        )}
        {invite.isError && (
          <Stack>
            <Alert color="red" icon={<IconAlertTriangle />} title="Invite not valid">
              {isApiError(invite.error) ? invite.error.message : 'This invite link could not be opened.'}
            </Alert>
            <Anchor component={Link} to="/login" size="sm">
              Go to the login screen
            </Anchor>
          </Stack>
        )}
        {invite.data && (
          <form onSubmit={onSubmit} noValidate>
            <Stack>
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  {invite.data.clinicName}
                </Text>
                <Title order={2} fz={22}>
                  Welcome, {invite.data.name}
                </Title>
                <Group gap={6}>
                  <Text size="sm">You have been invited as</Text>
                  {invite.data.roleNames.map((r) => (
                    <Badge key={r} variant="light">
                      {r}
                    </Badge>
                  ))}
                </Group>
              </Stack>
              <PasswordInput label="Choose a password" description="At least 8 characters" data-autofocus autoFocus {...register('password')} error={formState.errors.password?.message} />
              <PasswordInput label="Type it again" {...register('confirm')} error={formState.errors.confirm?.message} />
              <Button type="submit" loading={accept.isPending} fullWidth>
                Accept invite and sign in
              </Button>
              <Alert variant="light" color="blue" icon={<IconInfoCircle />} p="xs">
                <Text size="xs">
                  Use this password to sign in from now on. The live system also sets up two-factor login (MFA) here. This link is valid until {formatDateTime(invite.data.expiresAt)}.
                </Text>
              </Alert>
            </Stack>
          </form>
        )}
      </Paper>
    </Center>
  )
}
