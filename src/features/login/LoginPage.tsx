import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Anchor, Button, Center, Divider, Group, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core'
import { IconAlertTriangle, IconHeartbeat, IconLock, IconUsers } from '@tabler/icons-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { usePasswordLogin, useSession } from '@/auth/queries'
import { signInSchema, type SignInInput } from '@/types/auth'
import { goPastLogin } from './goPastLogin'
import { ForgotPasswordModal } from './ForgotPasswordModal'

/** Sign in with username (or mobile) and password. The demo user picker is one click away. */
export function LoginPage() {
  const { token, data: session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const login = usePasswordLogin()
  const [forgot, setForgot] = useState(false)
  const { register, handleSubmit, formState, getValues, setFocus } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { identifier: '', password: '' } })

  if (token && session) return <Navigate to={from} replace />

  const submit = handleSubmit((input) =>
    login.mutate(input, {
      onSuccess: (result) => goPastLogin(navigate, result, from),
      onError: (e) => {
        if (isApiError(e) && e.code === 'bad_credentials') setFocus('password')
      },
    }),
  )
  const error = login.error
  const locked = isApiError(error) && error.code === 'locked'

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Stack w={400} maw="100%" gap="lg">
        <Group gap="sm" justify="center">
          <ThemeIcon size={40} radius="md" color="teal">
            <IconHeartbeat size={24} />
          </ThemeIcon>
          <div>
            <Title order={2} fz={22}>
              Hospital OPD
            </Title>
            <Text size="xs" c="dimmed">
              Sign in to your hospital
            </Text>
          </div>
        </Group>
        <Paper withBorder radius="md" p="xl" shadow="xs">
          <form onSubmit={submit} noValidate>
            <Stack>
              <TextInput label="Username or mobile number" placeholder="e.g. priya.patil" autoComplete="username" autoFocus {...register('identifier')} error={formState.errors.identifier?.message} />
              <PasswordInput label="Password" autoComplete="current-password" {...register('password')} error={formState.errors.password?.message} />
              {error && (
                <Alert color={locked ? 'orange' : 'red'} variant="light" p="xs" icon={locked ? <IconLock size={16} /> : <IconAlertTriangle size={16} />}>
                  <Text size="sm">{isApiError(error) ? error.message : 'Could not sign in. Try again.'}</Text>
                </Alert>
              )}
              <Button type="submit" size="md" loading={login.isPending}>
                Sign in
              </Button>
              <Anchor component="button" type="button" size="sm" ta="center" onClick={() => setForgot(true)}>
                Forgot password?
              </Anchor>
            </Stack>
          </form>
        </Paper>
        <Divider label="Trying the demo?" labelPosition="center" />
        <Button component={Link} to="/login/demo" state={location.state} variant="light" leftSection={<IconUsers size={18} />}>
          Pick a demo user (no password)
        </Button>
        <Text size="xs" c="dimmed" ta="center">
          Every demo user’s password is <b>demo@123</b>, e.g. <b>sanjay.kulkarni</b> (Clinic Admin) or <b>vikram.rao</b> (Doctor). Sign in as <b>rohan.mehta</b> (Platform Super Admin) to provision a brand-new clinic and walk through its setup wizard.
        </Text>
      </Stack>
      {forgot && <ForgotPasswordModal initialIdentifier={getValues('identifier')} onClose={() => setForgot(false)} onDone={(result) => goPastLogin(navigate, result, from)} />}
    </Center>
  )
}
