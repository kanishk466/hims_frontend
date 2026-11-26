import { zodResolver } from '@hookform/resolvers/zod'
import { Button, CopyButton, Grid, Group, Modal, MultiSelect, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useCan } from '@/auth/useCan'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { inviteUrl } from '@/lib/invite'
import { userInputSchema, type UserInput, type UserSummary } from '@/types/auth'
import { useDoctors } from '../masters/queries'
import { useRoles, useSaveUser } from './queries'

interface Props {
  opened: boolean
  onClose: () => void
  /** null = add (invite) a user */
  user: UserSummary | null
  /** Pre-select roles for a new user, e.g. from "Add front office login". */
  presetRoleIds?: string[]
}

const DESIGNATION_BY_ROLE: Record<string, string> = {
  frontOffice: 'Front Office Executive',
  cashier: 'OPD Cashier',
  nurse: 'Staff Nurse',
  doctor: 'Consultant',
  accounts: 'Accounts Executive',
  admin: 'Administrator',
  md: 'Medical Director',
}

/** Add / edit a user. New users get an invite link (shown after saving). */
export function UserFormModal({ opened, onClose, user, presetRoleIds }: Props) {
  const { data: roles } = useRoles()
  const { data: doctors } = useDoctors()
  const save = useSaveUser()
  const canDeactivate = useCan('admin.users.cancel')
  const [invite, setInvite] = useState<{ name: string; token: string } | null>(null)
  const { register, control, handleSubmit, reset, setError, setValue, getValues, formState } = useForm<UserInput>({ resolver: zodResolver(userInputSchema) })
  const e = formState.errors

  useEffect(() => {
    if (!opened) return
    reset(
      user
        ? { name: user.name, mobile: user.mobile, email: user.email ?? '', designation: user.designation, roleIds: user.roles.map((r) => r.id), doctorId: user.doctor?.id ?? null, active: user.status !== 'inactive' }
        : { name: '', mobile: '', email: '', designation: '', roleIds: presetRoleIds ?? [], doctorId: null, active: true },
    )
  }, [opened, user, presetRoleIds, reset])

  const watchedRoles = useWatch({ control, name: 'roleIds' })
  const close = () => {
    setInvite(null)
    onClose()
  }
  const roleIds = watchedRoles ?? []
  const firstRoleId = roleIds[0]
  const doctorRoleId = roles?.find((r) => r.templateKey === 'doctor')?.id
  const isDoctor = !!doctorRoleId && roleIds.includes(doctorRoleId)

  // Fill a sensible job title from the first role, until the user types one.
  useEffect(() => {
    if (user || formState.dirtyFields.designation || !roles) return
    const key = roles.find((r) => r.id === firstRoleId)?.templateKey
    if (key && DESIGNATION_BY_ROLE[key]) setValue('designation', DESIGNATION_BY_ROLE[key])
  }, [firstRoleId, roles, user, formState.dirtyFields.designation, setValue])

  // Picking the linked doctor fills name and mobile when empty.
  const pickDoctor = (id: string | null) => {
    setValue('doctorId', id)
    const d = doctors?.find((x) => x.id === id)
    if (d && !getValues('name')) setValue('name', d.name, { shouldValidate: true })
    if (d?.mobile && !getValues('mobile')) setValue('mobile', d.mobile, { shouldValidate: true })
  }

  const onSubmit = handleSubmit((input) =>
    save.mutate(
      { id: user?.id, input: { ...input, doctorId: isDoctor ? input.doctorId : null } },
      {
        onSuccess: (saved) => {
          if (!user && 'inviteToken' in saved) setInvite({ name: saved.name, token: (saved as { inviteToken: string }).inviteToken })
          else {
            notifySaved(`${saved.name} updated.`)
            close()
          }
        },
        onError: (err) => showApiError(err, setError),
      },
    ),
  )
  useHotkeys(opened && !invite ? [['mod+S', () => onSubmit()]] : [], [])

  if (invite) {
    const link = inviteUrl(invite.token)
    return (
      <Modal opened={opened} onClose={close} title="Invite created">
        <Stack>
          <Text size="sm">
            {invite.name} gets this link by SMS and email in the live system. It is valid for 72 hours.
          </Text>
          <Group gap="xs" wrap="nowrap">
            <TextInput value={link} readOnly style={{ flex: 1 }} aria-label="Invite link" />
            <CopyButton value={link}>
              {({ copied, copy }) => (
                <Button variant={copied ? 'light' : 'default'} onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Text size="xs" c="dimmed">
            Demo: they also appear under “Other users” on the login screen with an “Accept invite” link.
          </Text>
          <Group justify="flex-end">
            <Button onClick={close} data-autofocus>
              Done
            </Button>
          </Group>
        </Stack>
      </Modal>
    )
  }

  return (
    <Modal opened={opened} onClose={close} title={user ? `Edit ${user.name}` : 'Add user'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          <Controller
            control={control}
            name="roleIds"
            render={({ field, fieldState }) => (
              <MultiSelect
                label="Roles"
                description="What this person can do. A small-clinic doctor can also be a Cashier."
                withAsterisk
                data={(roles ?? []).map((r) => ({ value: r.id, label: r.name }))}
                error={fieldState.error?.message}
                data-autofocus={!presetRoleIds?.length || undefined}
                searchable
                {...field}
              />
            )}
          />
          {isDoctor && (
            <Controller
              control={control}
              name="doctorId"
              render={({ field, fieldState }) => (
                <Select
                  label="Linked doctor"
                  description="Their queue and prescriptions are signed as this doctor"
                  data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))}
                  searchable
                  clearable
                  error={fieldState.error?.message}
                  value={field.value ?? null}
                  onChange={pickDoctor}
                  data-autofocus={!!presetRoleIds?.length || undefined}
                />
              )}
            />
          )}
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Full name" withAsterisk data-autofocus={(!!presetRoleIds?.length && !isDoctor) || undefined} {...register('name')} error={e.name?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Job title" withAsterisk {...register('designation')} error={e.designation?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput label="Mobile number" inputMode="numeric" maxLength={10} withAsterisk description="Used to log in" {...register('mobile')} error={e.mobile?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <TextInput label="Email" type="email" description="Invite is sent here" {...register('email')} error={e.email?.message} />
            </Grid.Col>
          </Grid>
          {user && canDeactivate && (
            <Controller
              control={control}
              name="active"
              render={({ field, fieldState }) => (
                <Switch label="Active" description="Inactive users cannot log in. Their history is kept." checked={field.value} onChange={(ev) => field.onChange(ev.currentTarget.checked)} error={fieldState.error?.message} />
              )}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {user ? 'Save' : 'Save and send invite'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
