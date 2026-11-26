import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Group, Modal, PasswordInput, PinInput, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { isApiError } from '@/api/client'
import { useRequestPasswordReset, useResetPassword } from '@/auth/queries'
import { resetPasswordSchema, type LoginResult, type ResetPasswordInput, type ResetRequestResult } from '@/types/auth'

/** Forgot password: code to the registered mobile, then a new password (also unlocks a locked login). */
export function ForgotPasswordModal({ initialIdentifier, onClose, onDone }: { initialIdentifier: string; onClose: () => void; onDone: (result: LoginResult) => void }) {
  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [sent, setSent] = useState<ResetRequestResult | null>(null)
  const request = useRequestPasswordReset()
  const reset = useResetPassword()
  const { register, control, handleSubmit, formState } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { identifier, otp: '', password: '', confirm: '' },
  })

  const send = () => request.mutate(identifier, { onSuccess: setSent })

  return (
    <Modal opened onClose={onClose} title="Reset your password">
      {!sent ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <Stack>
            <Text size="sm" c="dimmed">
              We will send a 6-digit code to the mobile number on your login.
            </Text>
            <TextInput label="Username or mobile number" value={identifier} onChange={(e) => setIdentifier(e.currentTarget.value)} data-autofocus />
            {request.error && <Alert color="red">{isApiError(request.error) ? request.error.message : 'Could not send the code.'}</Alert>}
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={request.isPending} disabled={identifier.trim().length < 3}>
                Send code
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <form onSubmit={handleSubmit((input) => reset.mutate({ ...input, identifier }, { onSuccess: (result) => onDone(result) }))} noValidate>
          <Stack>
            <Text size="sm">
              Code sent to <b>{sent.maskedMobile}</b>. It is valid for 10 minutes.
            </Text>
            {sent.demoOtp && (
              <Alert color="blue" variant="light" p="xs">
                <Text size="sm">
                  Demo: the code is <b>{sent.demoOtp}</b>. The live system sends it by SMS.
                </Text>
              </Alert>
            )}
            <Controller
              control={control}
              name="otp"
              render={({ field }) => (
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    6-digit code
                  </Text>
                  <PinInput length={6} type="number" oneTimeCode value={field.value} onChange={field.onChange} aria-label="6-digit code" autoFocus error={!!formState.errors.otp} />
                  {formState.errors.otp && (
                    <Text size="xs" c="red">
                      {formState.errors.otp.message}
                    </Text>
                  )}
                </Stack>
              )}
            />
            <PasswordInput label="New password" description="At least 8 characters" autoComplete="new-password" {...register('password')} error={formState.errors.password?.message} />
            <PasswordInput label="Type it again" autoComplete="new-password" {...register('confirm')} error={formState.errors.confirm?.message} />
            {reset.error && <Alert color="red">{isApiError(reset.error) ? reset.error.message : 'Could not reset the password.'}</Alert>}
            <Group justify="space-between">
              <Button variant="subtle" onClick={send} loading={request.isPending}>
                Send a new code
              </Button>
              <Button type="submit" loading={reset.isPending}>
                Save and sign in
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  )
}
