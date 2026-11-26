import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import type { RoleDetail } from '@/types/auth'
import { useCreateRole } from './queries'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a role name').max(40),
  description: z.string().trim().max(200),
  copyFromId: z.string(),
})
type Form = z.infer<typeof schema>

interface Props {
  opened: boolean
  onClose: () => void
  roles: RoleDetail[]
  /** Pre-selected role to copy ("Copy role"). */
  copyFrom?: RoleDetail | null
  onCreated: (role: RoleDetail) => void
}

/** New role: start empty or as a copy of an existing role. */
export function NewRoleModal({ opened, onClose, roles, copyFrom, onCreated }: Props) {
  const create = useCreateRole()
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Form>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (opened) reset({ name: copyFrom ? `${copyFrom.name} (copy)` : '', description: copyFrom?.description ?? '', copyFromId: copyFrom?.id ?? '' })
  }, [opened, copyFrom, reset])

  const onSubmit = handleSubmit(({ name, description, copyFromId }) =>
    create.mutate(
      { input: { name, description, permissions: [] }, copyFromId: copyFromId || undefined },
      {
        onSuccess: (role) => {
          notifySaved(`Role ${role.name} created.`)
          onCreated(role)
        },
        onError: (e) => showApiError(e, setError),
      },
    ),
  )

  return (
    <Modal opened={opened} onClose={onClose} title={copyFrom ? `Copy ${copyFrom.name}` : 'New role'}>
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          <TextInput label="Role name" placeholder="e.g. Senior Cashier" withAsterisk data-autofocus {...register('name')} error={formState.errors.name?.message} />
          <TextInput label="Description" placeholder="What this role is for" {...register('description')} />
          <Controller
            control={control}
            name="copyFromId"
            render={({ field }) => (
              <Select
                label="Start with the permissions of"
                description="You can change every tick afterwards"
                data={[{ value: '', label: 'Nothing (empty role)' }, ...roles.filter((r) => r.active).map((r) => ({ value: r.id, label: r.name }))]}
                allowDeselect={false}
                {...field}
              />
            )}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create role
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
