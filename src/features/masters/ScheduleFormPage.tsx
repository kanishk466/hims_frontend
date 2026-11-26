import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Chip, Grid, Group, Input, Loader, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { TimeInput } from '@mantine/dates'
import { useHotkeys } from '@mantine/hooks'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { WEEKDAYS_SHORT } from '@/lib/india'
import { scheduleInputSchema, slotCount, SLOT_MINUTES, type ScheduleInput } from '@/types/masters'
import { useDoctors, useSaveSchedule, useSchedules } from './queries'

const LIST_PATH = '/masters/schedules'
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

const PRESETS: { label: string; value: Pick<ScheduleInput, 'weekdays' | 'start' | 'end'> }[] = [
  { label: 'Mon–Sat morning', value: { weekdays: [1, 2, 3, 4, 5, 6], start: '10:00', end: '14:00' } },
  { label: 'Mon–Fri evening', value: { weekdays: [1, 2, 3, 4, 5], start: '17:00', end: '20:00' } },
  { label: 'Tue/Thu/Sat', value: { weekdays: [2, 4, 6], start: '11:00', end: '14:00' } },
]

/** Stage 7a: Add/Edit OPD session, converted from ScheduleFormModal to its own route (Masters → Schedules only; the wizard keeps the modal, see ScheduleFormModal.tsx). */
export function ScheduleFormPage() {
  const { doctorId, scheduleId } = useParams()
  const navigate = useNavigate()
  const { data: doctors } = useDoctors(true)
  const doctor = (doctors ?? []).find((d) => d.id === doctorId) ?? null
  const { data: schedules } = useSchedules()
  const schedule = scheduleId ? (schedules ?? []).find((s) => s.id === scheduleId) : null
  const save = useSaveSchedule()
  const { register, control, handleSubmit, reset, setError, setValue, formState } = useForm<ScheduleInput>({ resolver: zodResolver(scheduleInputSchema) })

  const back = () => navigate(LIST_PATH)

  useEffect(() => {
    if (!doctor) return
    reset(
      schedule
        ? { ...schedule, room: schedule.room ?? '' }
        : { doctorId: doctor.id, weekdays: [1, 2, 3, 4, 5, 6], start: '10:00', end: '14:00', slotMinutes: 10, maxPatients: undefined, walkInQuota: undefined, room: '' },
    )
  }, [doctor, schedule, reset])

  const onSubmit = handleSubmit((input) =>
    save.mutate(
      { id: schedule?.id, input },
      {
        onSuccess: () => {
          notifySaved(`OPD session saved for ${doctor?.name}.`)
          back()
        },
        onError: (e) => showApiError(e, setError),
      },
    ),
  )
  useHotkeys([['mod+S', () => onSubmit()]], [])

  const [start, end, slot] = useWatch({ control, name: ['start', 'end', 'slotMinutes'] })
  const slots = start && end && slot ? slotCount({ start, end, slotMinutes: slot }) : 0

  if (!doctors || !schedules) return <Loader />
  if (!doctor) return <Alert color="red">Doctor not found.</Alert>
  if (scheduleId && !schedule) return <Alert color="red">Session not found.</Alert>

  return (
    <FormPage title={`${schedule ? 'Edit' : 'Add'} OPD session · ${doctor.name}`} onBack={back} width={760}>
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {!schedule && (
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Quick fill:
              </Text>
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="compact-sm"
                  variant="light"
                  onClick={() => {
                    setValue('weekdays', p.value.weekdays, { shouldValidate: true })
                    setValue('start', p.value.start, { shouldValidate: true })
                    setValue('end', p.value.end, { shouldValidate: true })
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </Group>
          )}

          <Controller
            control={control}
            name="weekdays"
            render={({ field, fieldState }) => (
              <Input.Wrapper label="Days" withAsterisk error={fieldState.error?.message}>
                <Chip.Group multiple value={field.value?.map(String) ?? []} onChange={(v) => field.onChange(v.map(Number))}>
                  <Group gap={6} mt={4}>
                    {MONDAY_FIRST.map((d) => (
                      <Chip key={d} value={String(d)} size="sm">
                        {WEEKDAYS_SHORT[d]}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </Input.Wrapper>
            )}
          />

          <Grid gap="sm">
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <TimeInput label="Starts" withAsterisk data-autofocus {...register('start')} error={formState.errors.start?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <TimeInput label="Ends" withAsterisk {...register('end')} error={formState.errors.end?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={control}
                name="slotMinutes"
                render={({ field }) => (
                  <Select
                    label="Slot length"
                    data={SLOT_MINUTES.map((m) => ({ value: String(m), label: `${m} minutes` }))}
                    allowDeselect={false}
                    value={String(field.value ?? 10)}
                    onChange={(v) => field.onChange(Number(v))}
                    description={slots ? `${slots} appointment slots` : ' '}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Controller
                control={control}
                name="maxPatients"
                render={({ field, fieldState }) => (
                  <NumberInput label="Max patients" description="Optional cap" min={1} allowDecimal={false} value={field.value ?? ''} onChange={(v) => field.onChange(v === '' ? undefined : Number(v))} error={fieldState.error?.message} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Controller
                control={control}
                name="walkInQuota"
                render={({ field, fieldState }) => (
                  <NumberInput label="Walk-in quota" description="Kept free for walk-ins" min={0} allowDecimal={false} value={field.value ?? ''} onChange={(v) => field.onChange(v === '' ? undefined : Number(v))} error={fieldState.error?.message} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label="Room" description="Shown on the TV queue" placeholder="OPD 3" {...register('room')} />
            </Grid.Col>
          </Grid>

          <Group justify="flex-end">
            <Button variant="default" onClick={back}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save session
            </Button>
          </Group>
        </Stack>
      </form>
    </FormPage>
  )
}
