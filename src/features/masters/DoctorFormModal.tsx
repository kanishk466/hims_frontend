import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Grid, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { MoneyInput } from '@/components/MoneyInput'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { MEDICAL_COUNCILS } from '@/lib/india'
import { DOCTOR_TYPE_LABELS, DOCTOR_TYPES, doctorInputSchema, type Doctor, type DoctorInput } from '@/types/masters'
import { useDepartments, useSaveDoctor } from './queries'

interface Props {
  opened: boolean
  onClose: () => void
  /** null = add a new doctor */
  doctor: Doctor | null
}

const blank = (council: string, departmentId?: string): DoctorInput => ({
  name: '',
  departmentId: departmentId ?? '',
  qualification: '',
  council,
  registrationNo: '',
  feeNewPaise: 50000,
  feeFollowUpPaise: 30000,
  type: 'fullTime',
  mobile: '',
})

/**
 * Add / edit doctor, as a modal. "Save and add another" keeps the department and council for
 * fast entry.
 *
 * Stage 7a converted the standalone Masters → Doctors screen to use DoctorFormPage instead, but
 * this modal is kept because the first-time setup wizard (DoctorsStep.tsx) embeds it as one step
 * of a multi-step flow, where navigating away to a new route isn't appropriate.
 */
export function DoctorFormModal({ opened, onClose, doctor }: Props) {
  const { data: departments } = useDepartments()
  const save = useSaveDoctor()
  const { register, control, handleSubmit, reset, setError, getValues, setFocus, formState } = useForm<DoctorInput>({ resolver: zodResolver(doctorInputSchema) })
  const e = formState.errors

  useEffect(() => {
    if (!opened) return
    if (doctor) reset({ ...doctor, mobile: doctor.mobile ?? '' })
    else reset(blank('Maharashtra Medical Council', departments?.length === 1 ? departments[0]!.id : undefined))
  }, [opened, doctor, reset, departments])

  const submit = (addAnother: boolean) =>
    handleSubmit((input) =>
      save.mutate(
        { id: doctor?.id, input },
        {
          onSuccess: (d) => {
            notifySaved(doctor ? `${d.name} updated.` : `${d.name} added.`)
            if (addAnother) {
              const keep = getValues()
              reset({ ...blank(keep.council, keep.departmentId), type: keep.type })
              setTimeout(() => setFocus('name'), 0)
            } else onClose()
          },
          onError: (err) => showApiError(err, setError),
        },
      ),
    )()

  useHotkeys(opened ? [['mod+S', () => submit(false)]] : [], [])

  return (
    <Modal opened={opened} onClose={onClose} title={doctor ? `Edit ${doctor.name}` : 'Add doctor'} size="lg">
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          submit(false)
        }}
        noValidate
      >
        <Stack>
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <TextInput label="Full name" placeholder="Dr. Anita Kulkarni" withAsterisk data-autofocus {...register('name')} error={e.name?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <Controller
                control={control}
                name="departmentId"
                render={({ field, fieldState }) => (
                  <Select
                    label="Department"
                    withAsterisk
                    searchable
                    data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
                    nothingFoundMessage="Add the department first"
                    error={fieldState.error?.message}
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? '')}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput label="Qualifications" placeholder="MBBS, MD (Medicine)" withAsterisk {...register('qualification')} error={e.qualification?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <Controller
                control={control}
                name="council"
                render={({ field, fieldState }) => (
                  <Select label="Medical council" withAsterisk searchable data={[...MEDICAL_COUNCILS]} error={fieldState.error?.message} value={field.value || null} onChange={(v) => field.onChange(v ?? '')} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput label="Registration number" placeholder="MMC 2014/06/3876" withAsterisk {...register('registrationNo')} error={e.registrationNo?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Controller
                control={control}
                name="feeNewPaise"
                render={({ field, fieldState }) => <MoneyInput label="New visit fee" withAsterisk value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Controller
                control={control}
                name="feeFollowUpPaise"
                render={({ field, fieldState }) => <MoneyInput label="Follow-up fee" withAsterisk value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label="Mobile (optional)" inputMode="numeric" maxLength={10} {...register('mobile')} error={e.mobile?.message} />
            </Grid.Col>
            <Grid.Col span={12}>
              <Text size="sm" fw={500} mb={4}>
                Type
              </Text>
              <Controller
                control={control}
                name="type"
                render={({ field }) => <SegmentedControl data={DOCTOR_TYPES.map((t) => ({ value: t, label: DOCTOR_TYPE_LABELS[t] }))} {...field} />}
              />
            </Grid.Col>
          </Grid>
          <Text size="xs" c="dimmed">
            A fee change becomes a new consultation rate from today; old bills keep the price they were billed at.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            {!doctor && (
              <Button variant="light" onClick={() => submit(true)} loading={save.isPending}>
                Save and add another
              </Button>
            )}
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
