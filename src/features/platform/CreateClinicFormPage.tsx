import { zodResolver } from '@hookform/resolvers/zod'
import { Divider, Grid, Group, NumberInput, Select, Stack, Text, TextInput, Button } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import { showApiError } from '@/lib/apiErrors'
import { INDIAN_STATES, suggestClinicCode } from '@/lib/india'
import { createClinicSchema, PLAN_LABELS, PLANS, type CreateClinicInput, type ProvisionResult } from '@/types/clinic'
import { useCreateClinic } from './queries'

const LIST_PATH = '/platform/clinics'

const EMPTY: CreateClinicInput = {
  name: '',
  code: '',
  city: '',
  state: 'Maharashtra',
  plan: 'trial',
  beds: 30,
  adminName: '',
  adminMobile: '',
  adminEmail: '',
}

/**
 * Stage 7c: Create clinic, converted from CreateClinicModal to its own route. On success,
 * navigates back to the Clinics list carrying the provisioning result in router state, so the
 * list can show it in ProvisionResultModal (out of scope for this conversion — it's a result
 * display, not a form).
 */
export function CreateClinicFormPage() {
  const navigate = useNavigate()
  const back = () => navigate(LIST_PATH)
  const create = useCreateClinic()
  const form = useForm<CreateClinicInput>({ resolver: zodResolver(createClinicSchema), defaultValues: EMPTY })
  const { register, control, handleSubmit, formState, setValue, reset, setError } = form
  const code = useWatch({ control, name: 'code' })
  const codeTouched = useRef(false)

  useEffect(() => {
    reset(EMPTY)
    codeTouched.current = false
  }, [reset])

  const onSubmit = handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (result: ProvisionResult) => navigate(LIST_PATH, { state: { provisionResult: result } }),
      onError: (e) => showApiError(e, setError),
    }),
  )

  const nameField = register('name')
  const codeField = register('code')

  return (
    <FormPage title="Create clinic" onBack={back} width={760}>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap="md">
          <Grid gap="sm">
            <Grid.Col span={12}>
              <TextInput
                label="Clinic or hospital name"
                placeholder="e.g. Lotus Care Clinic"
                withAsterisk
                data-autofocus
                {...nameField}
                onChange={(e) => {
                  nameField.onChange(e)
                  if (!codeTouched.current) setValue('code', suggestClinicCode(e.currentTarget.value))
                }}
                error={formState.errors.name?.message}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Clinic code"
                description="Web address and UHID prefix"
                rightSection={<Text size="xs" c="dimmed" pr={8}>.yourhms.in</Text>}
                rightSectionWidth={90}
                withAsterisk
                {...codeField}
                onChange={(e) => {
                  codeTouched.current = true
                  e.currentTarget.value = e.currentTarget.value.toLowerCase()
                  codeField.onChange(e)
                }}
                error={formState.errors.code?.message}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={control}
                name="plan"
                render={({ field }) => (
                  <Select
                    label="Plan"
                    description="Trial runs 14 days with full OPD"
                    data={PLANS.map((p) => ({ value: p, label: PLAN_LABELS[p] }))}
                    allowDeselect={false}
                    {...field}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput label="City" withAsterisk {...register('city')} error={formState.errors.city?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={control}
                name="state"
                render={({ field, fieldState }) => (
                  <Select label="State" data={[...INDIAN_STATES]} searchable allowDeselect={false} withAsterisk error={fieldState.error?.message} {...field} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Controller
                control={control}
                name="beds"
                render={({ field, fieldState }) => (
                  <NumberInput label="Beds" min={0} max={1000} allowDecimal={false} error={fieldState.error?.message} value={field.value} onChange={(v) => field.onChange(v === '' ? undefined : Number(v))} onBlur={field.onBlur} />
                )}
              />
            </Grid.Col>
          </Grid>

          <Divider label="Clinic Admin (receives the invite)" labelPosition="left" />
          <Grid gap="sm">
            <Grid.Col span={12}>
              <TextInput label="Full name" withAsterisk {...register('adminName')} error={formState.errors.adminName?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput label="Mobile number" inputMode="numeric" maxLength={10} withAsterisk {...register('adminMobile')} error={formState.errors.adminMobile?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <TextInput label="Email" type="email" withAsterisk {...register('adminEmail')} error={formState.errors.adminEmail?.message} />
            </Grid.Col>
          </Grid>

          <Text size="xs" c="dimmed">
            Creates {code || 'the clinic'}.yourhms.in with the standard roles and number series, and emails the admin an invite valid for 72 hours.
          </Text>

          <Group justify="flex-end">
            <Button variant="default" onClick={back}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create clinic
            </Button>
          </Group>
        </Stack>
      </form>
    </FormPage>
  )
}
