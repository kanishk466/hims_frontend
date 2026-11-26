import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Group, Loader, NumberInput, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { PLAN_LABELS, PLANS, updateClinicSchema, type UpdateClinicInput } from '@/types/clinic'
import { useClinics, useUpdateClinic } from './queries'

const LIST_PATH = '/platform/clinics'

/** Stage 7c: Edit clinic (plan, beds, status), converted from EditClinicModal to its own route. */
export function EditClinicFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const back = () => navigate(LIST_PATH)
  const { data: clinics } = useClinics()
  const clinic = id ? (clinics ?? []).find((c) => c.id === id) : null
  const update = useUpdateClinic()
  const { register, control, handleSubmit, reset, setError, formState } = useForm<UpdateClinicInput>({ resolver: zodResolver(updateClinicSchema) })

  useEffect(() => {
    if (clinic) reset({ name: clinic.name, plan: clinic.plan, status: clinic.status, beds: clinic.beds })
  }, [clinic, reset])

  const status = useWatch({ control, name: 'status' })
  const onSubmit = handleSubmit((input) =>
    update.mutate(
      { id: clinic!.id, input },
      {
        onSuccess: () => {
          notifySaved(`${input.name} updated.`)
          back()
        },
        onError: (e) => showApiError(e, setError),
      },
    ),
  )

  if (!clinics) return <Loader />
  if (!clinic) return <Alert color="red">Clinic not found.</Alert>

  return (
    <FormPage title={`Edit ${clinic.name}`} onBack={back}>
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          <TextInput label="Name" data-autofocus {...register('name')} error={formState.errors.name?.message} />
          <Group grow>
            <Controller
              control={control}
              name="plan"
              render={({ field }) => <Select label="Plan" data={PLANS.map((p) => ({ value: p, label: PLAN_LABELS[p] }))} allowDeselect={false} {...field} />}
            />
            <Controller
              control={control}
              name="beds"
              render={({ field }) => <NumberInput label="Beds" min={0} allowDecimal={false} value={field.value} onChange={(v) => field.onChange(Number(v) || 0)} />}
            />
          </Group>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Status
            </Text>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <SegmentedControl
                  data={[
                    { value: 'trial', label: 'Trial' },
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                  ]}
                  {...field}
                />
              )}
            />
          </Stack>
          {status === 'suspended' && clinic.status !== 'suspended' && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle />}>
              Everyone at this clinic is logged out and cannot log in until you reactivate it. Their data is kept.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={back}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending} color={status === 'suspended' && clinic.status !== 'suspended' ? 'red' : undefined}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </FormPage>
  )
}
