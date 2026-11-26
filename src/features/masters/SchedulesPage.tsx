import { zodResolver } from '@hookform/resolvers/zod'
import { ActionIcon, Badge, Button, Card, Group, Modal, Select, Stack, Table, Tabs, Text, TextInput, Tooltip } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconCalendarOff, IconPlus, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatDay, todayIST } from '@/lib/dates'
import { leaveInputSchema, type LeaveInput } from '@/types/masters'
import { DoctorSessions } from './DoctorSessions'
import { useCancelLeave, useCreateLeave, useDepartments, useDoctors, useLeaves } from './queries'

/** Masters → Schedules: weekly OPD timings per doctor, and leave / hospital holidays. */
export function SchedulesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'timings'
  const doctorId = params.get('doctor')
  const [dept, setDept] = useState<string | null>(null)
  const { data: doctors } = useDoctors()
  const { data: departments } = useDepartments()
  const shown = (doctors ?? []).filter((d) => (!doctorId || d.id === doctorId) && (!dept || d.departmentId === dept))
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next)
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Schedules" subtitle="When each doctor sees OPD patients, and when they are away. Appointments (build step 5) are booked into these slots." />
      <Tabs value={tab} onChange={(v) => set('tab', v === 'timings' ? null : v)} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="timings">Weekly timings</Tabs.Tab>
          <Tabs.Tab value="leave" leftSection={<IconCalendarOff size={16} />}>
            Leave & holidays
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="timings" pt="md">
          <Stack>
            <Group gap="sm">
              <Select placeholder="All departments" data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} value={dept} onChange={setDept} clearable w={220} aria-label="Filter by department" />
              <Select placeholder="All doctors" data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={(v) => set('doctor', v)} clearable searchable w={240} aria-label="Filter by doctor" />
            </Group>
            <DoctorSessions
              doctors={shown}
              onAdd={(d) => navigate(`/masters/schedules/${d.id}/new`)}
              onEdit={(d, s) => navigate(`/masters/schedules/${d.id}/${s.id}/edit`)}
            />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="leave" pt="md">
          <LeaveTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function LeaveTab() {
  const [past, setPast] = useState(false)
  const { data: leaves } = useLeaves(past)
  const { data: doctors } = useDoctors(true)
  const cancel = useCancelLeave()
  const canCancel = useCan('masters.schedules.cancel')
  const [open, setOpen] = useState(false)
  const today = todayIST()

  return (
    <Stack>
      <Group justify="space-between">
        <Button variant={past ? 'light' : 'subtle'} size="compact-sm" onClick={() => setPast((p) => !p)}>
          {past ? 'Hide past entries' : 'Show past entries'}
        </Button>
        <Can permission="masters.schedules.create">
          <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>
            Add leave or holiday
          </Button>
        </Can>
      </Group>
      <Card withBorder radius="md" p={0}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Who</Table.Th>
              <Table.Th>From</Table.Th>
              <Table.Th>To</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {leaves?.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="lg">
                    No leave or holidays coming up.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {leaves?.map((l) => (
              <Table.Tr key={l.id} style={l.to < today ? { opacity: 0.6 } : undefined}>
                <Table.Td>
                  {l.doctorId ? (
                    <Text size="sm" fw={500}>
                      {doctors?.find((d) => d.id === l.doctorId)?.name}
                    </Text>
                  ) : (
                    <Badge color="red" variant="light">
                      Whole hospital
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{formatDay(l.from)}</Table.Td>
                <Table.Td>{formatDay(l.to)}</Table.Td>
                <Table.Td>
                  <Text size="sm">{l.reason}</Text>
                </Table.Td>
                <Table.Td>
                  {canCancel && l.to >= today && (
                    <Tooltip label="Cancel this entry">
                      <ActionIcon variant="subtle" color="red" aria-label={`Cancel leave: ${l.reason}`} onClick={() => cancel.mutate(l.id, { onSuccess: () => notifySaved('Leave cancelled.'), onError: (e) => showApiError(e) })}>
                        <IconX size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <LeaveModal opened={open} onClose={() => setOpen(false)} />
    </Stack>
  )
}

const toYmd = (d: Date | string | null) => (d ? (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : '')

function LeaveModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: doctors } = useDoctors()
  const create = useCreateLeave()
  const { register, control, handleSubmit, reset, setError, formState } = useForm<LeaveInput>({ resolver: zodResolver(leaveInputSchema) })
  useEffect(() => {
    if (opened) reset({ doctorId: null, from: todayIST(), to: todayIST(), reason: '' })
  }, [opened, reset])

  const onSubmit = handleSubmit((input) =>
    create.mutate(input, {
      onSuccess: () => {
        notifySaved('Saved. Those days are blocked for appointments.')
        onClose()
      },
      onError: (e) => showApiError(e, setError),
    }),
  )

  return (
    <Modal opened={opened} onClose={onClose} title="Add leave or holiday">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          <Controller
            control={control}
            name="doctorId"
            render={({ field }) => (
              <Select
                label="Who"
                data={[{ value: '', label: 'Whole hospital (holiday)' }, ...(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))]}
                value={field.value ?? ''}
                onChange={(v) => field.onChange(v || null)}
                searchable
                allowDeselect={false}
                data-autofocus
              />
            )}
          />
          <Group grow>
            <Controller
              control={control}
              name="from"
              render={({ field, fieldState }) => (
                <DatePickerInput label="From" valueFormat="DD-MM-YYYY" value={field.value || null} onChange={(d) => field.onChange(toYmd(d))} error={fieldState.error?.message} minDate={new Date()} />
              )}
            />
            <Controller
              control={control}
              name="to"
              render={({ field, fieldState }) => (
                <DatePickerInput label="To" valueFormat="DD-MM-YYYY" value={field.value || null} onChange={(d) => field.onChange(toYmd(d))} error={fieldState.error?.message} minDate={new Date()} />
              )}
            />
          </Group>
          <TextInput label="Reason" placeholder="e.g. Conference, Diwali" withAsterisk {...register('reason')} error={formState.errors.reason?.message} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
