import { zodResolver } from '@hookform/resolvers/zod'
import { Avatar, Button, FileButton, Grid, Group, Loader, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconPhoto } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { INDIAN_STATES, MONTHS } from '@/lib/india'
import { clinicProfileSchema, NABH_LABELS, NABH_STATUSES, type Clinic, type ClinicProfile } from '@/types/clinic'
import { useClinicProfile, useUpdateClinicProfile } from './queries'
import { StepFooter } from './StepFooter'

const toForm = (c: Clinic): ClinicProfile => ({
  name: c.name,
  legalName: c.legalName,
  addressLine: c.addressLine,
  city: c.city,
  state: c.state,
  pinCode: c.pinCode,
  phone: c.phone,
  email: c.email ?? '',
  registrationNo: c.registrationNo,
  financialYearStartMonth: c.financialYearStartMonth,
  gstin: c.gstin ?? '',
  pan: c.pan ?? '',
  hfrId: c.hfrId ?? '',
  nabhStatus: c.nabhStatus,
  website: c.website ?? '',
  logoDataUrl: c.logoDataUrl,
})

export function ProfileStep({ onNext, canEdit }: { onNext: () => void; canEdit: boolean }) {
  const { data: clinic } = useClinicProfile()
  const save = useUpdateClinicProfile()
  const [logoError, setLogoError] = useState<string | null>(null)
  const form = useForm<ClinicProfile>({ resolver: zodResolver(clinicProfileSchema) })
  const { register, control, handleSubmit, reset, setError, setValue, formState } = form
  const logo = useWatch({ control, name: 'logoDataUrl' })
  const e = formState.errors

  useEffect(() => {
    if (clinic) reset(toForm(clinic))
  }, [clinic, reset])

  const submit = (next: boolean) =>
    handleSubmit((values) =>
      save.mutate(values, {
        onSuccess: () => {
          notifySaved('Hospital profile saved.')
          if (next) onNext()
        },
        onError: (err) => showApiError(err, setError),
      }),
    )()

  useHotkeys([['mod+S', () => canEdit && submit(false)]], [])

  const pickLogo = (file: File | null) => {
    setLogoError(null)
    if (!file) return
    if (file.size > 300_000) return setLogoError('Use an image under 300 KB')
    const reader = new FileReader()
    reader.onload = () => setValue('logoDataUrl', String(reader.result), { shouldDirty: true })
    reader.readAsDataURL(file)
  }

  if (!clinic) return <Loader />

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        submit(true)
      }}
      noValidate
    >
      <Stack gap="lg">
        <div>
          <Title order={3} fz="h4">
            Hospital profile
          </Title>
          <Text c="dimmed" size="sm">
            Shown on prescriptions, bills and OPD slips. You can change it later.
          </Text>
        </div>

        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
          <Stack gap="lg">
            <Group align="center" gap="md">
              <Avatar src={logo} size={64} radius="md" color="teal">
                <IconPhoto />
              </Avatar>
              <Stack gap={4}>
                <Group gap="xs">
                  <FileButton onChange={pickLogo} accept="image/png,image/jpeg,image/svg+xml">
                    {(props) => (
                      <Button variant="default" size="xs" {...props}>
                        {logo ? 'Change logo' : 'Upload logo'}
                      </Button>
                    )}
                  </FileButton>
                  {logo && (
                    <Button variant="subtle" color="gray" size="xs" onClick={() => setValue('logoDataUrl', undefined, { shouldDirty: true })}>
                      Remove
                    </Button>
                  )}
                </Group>
                <Text size="xs" c={logoError ? 'red' : 'dimmed'}>
                  {logoError ?? 'PNG, JPG or SVG under 300 KB. Recommended for prints.'}
                </Text>
              </Stack>
            </Group>

            <Grid gap="sm">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label="Display name" description="What patients see" withAsterisk data-autofocus autoFocus {...register('name')} error={e.name?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label="Legal name" description="As on the registration certificate" withAsterisk {...register('legalName')} error={e.legalName?.message} />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput label="Address" withAsterisk {...register('addressLine')} error={e.addressLine?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput label="City" withAsterisk {...register('city')} error={e.city?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 5 }}>
                <Controller
                  control={control}
                  name="state"
                  render={({ field, fieldState }) => <Select label="State" data={[...INDIAN_STATES]} searchable allowDeselect={false} withAsterisk error={fieldState.error?.message} {...field} />}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 3 }}>
                <TextInput label="PIN code" inputMode="numeric" maxLength={6} withAsterisk {...register('pinCode')} error={e.pinCode?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Phone" placeholder="020 2546 7788" withAsterisk {...register('phone')} error={e.phone?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Email" type="email" {...register('email')} error={e.email?.message} />
              </Grid.Col>
            </Grid>

            <Grid gap="sm">
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Hospital registration number" description="Clinical Establishments Act / municipal" withAsterisk {...register('registrationNo')} error={e.registrationNo?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller
                  control={control}
                  name="financialYearStartMonth"
                  render={({ field }) => (
                    <Select
                      label="Financial year starts in"
                      description="Bill and receipt numbers restart then"
                      data={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                      allowDeselect={false}
                      value={String(field.value)}
                      onChange={(v) => field.onChange(Number(v))}
                    />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput label="GSTIN" maxLength={15} {...register('gstin', { setValueAs: (v: string) => v?.toUpperCase() })} error={e.gstin?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput label="PAN" maxLength={10} {...register('pan', { setValueAs: (v: string) => v?.toUpperCase() })} error={e.pan?.message} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput label="HFR ID (ABDM)" description="Health Facility Registry" {...register('hfrId')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller
                  control={control}
                  name="nabhStatus"
                  render={({ field }) => <Select label="NABH status" data={NABH_STATUSES.map((s) => ({ value: s, label: NABH_LABELS[s] }))} allowDeselect={false} {...field} />}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Website" placeholder="www.example.in" {...register('website')} />
              </Grid.Col>
            </Grid>
          </Stack>
        </fieldset>

        <StepFooter canEdit={canEdit} saving={save.isPending} onSkip={onNext} />
      </Stack>
    </form>
  )
}
