import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Group, Loader, Select, Stack, TextInput } from '@mantine/core'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { FormPage } from '@/components/FormPage'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { useCreateRole, useRoleDetails } from './queries'

const LIST_PATH = '/admin/roles'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a role name').max(40),
  description: z.string().trim().max(200),
  copyFromId: z.string(),
})
type Form = z.infer<typeof schema>

/**
 * Stage 7b: New role, converted from NewRoleModal to its own route. Start empty, or as a copy of
 * an existing role (the optional :copyFromId param, from "Copy role" on the permission grid).
 * Roles are edited inline on the Roles & permissions grid, not on this page.
 */
export function RoleFormPage() {
  const { copyFromId } = useParams()
  const navigate = useNavigate()
  const { data: roles } = useRoleDetails()
  const copyFrom = copyFromId ? (roles ?? []).find((r) => r.id === copyFromId) : null
  const create = useCreateRole()
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Form>({ resolver: zodResolver(schema) })

  const back = () => navigate(LIST_PATH)

  useEffect(() => {
    reset({ name: copyFrom ? `${copyFrom.name} (copy)` : '', description: copyFrom?.description ?? '', copyFromId: copyFrom?.id ?? '' })
  }, [copyFrom, reset])

  const onSubmit = handleSubmit(({ name, description, copyFromId: fromId }) =>
    create.mutate(
      { input: { name, description, permissions: [] }, copyFromId: fromId || undefined },
      {
        onSuccess: (role) => {
          notifySaved(`Role ${role.name} created.`)
          navigate(`${LIST_PATH}?role=${role.id}`)
        },
        onError: (e) => showApiError(e, setError),
      },
    ),
  )

  if (!roles) return <Loader />
  if (copyFromId && !copyFrom) return <Alert color="red">Role not found.</Alert>

  return (
    <FormPage title={copyFrom ? `Copy ${copyFrom.name}` : 'New role'} onBack={back}>
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
            <Button variant="default" onClick={back}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create role
            </Button>
          </Group>
        </Stack>
      </form>
    </FormPage>
  )
}
