import { ActionIcon, Alert, Badge, Button, Card, Group, Menu, Modal, Select, SimpleGrid, Stack, Text, TextInput, Timeline, UnstyledButton } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconCalendarOff, IconChevronLeft, IconChevronRight, IconHistory, IconUserCheck, IconX, IconArrowsExchange } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { addDays, formatDateTime, formatLongDate, todayIST } from '@/lib/dates'
import { formatClock } from '@/lib/india'
import type { DaySlots, PatientBrief, Slot } from '@/types/opd'
import { useDepartments, useDoctors } from '../masters/queries'
import { PatientBadge } from './PatientBadge'
import { PatientPicker } from './PatientPicker'
import { useBookAppointment, useCancelAppointment, useDaySlots, usePatient, useRescheduleAppointment } from './queries'

const toYmd = (d: Date | string | null) =>
  d ? (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : todayIST()

/** OPD-03: slots per doctor per day from the schedule; book, reschedule, cancel. */
export function AppointmentsPage() {
  const [params, setParams] = useSearchParams()
  const { data: allDoctors } = useDoctors()
  const { data: departments } = useDepartments()
  // Casualty takes no appointments: emergency patients just arrive.
  const doctors = allDoctors?.filter((d) => !departments?.find((x) => x.id === d.departmentId)?.casualty)
  const doctorId = params.get('doctor') ?? doctors?.[0]?.id ?? null
  const date = params.get('date') ?? todayIST()
  const presetPatientId = params.get('patient')
  const { data: presetPatient } = usePatient(presetPatientId)
  const { data: day } = useDaySlots(doctorId, date)
  const [booking, setBooking] = useState<Slot | null>(null)
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next)
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Appointments" subtitle="Pick a doctor and a day. Free slots are white; click one to book. Patients who don’t arrive by the end of the session become no-shows." />
      {presetPatient && (
        <Alert variant="light" color="teal" withCloseButton onClose={() => set('patient', null)}>
          Booking for <b>{presetPatient.name}</b> ({presetPatient.uhid}). Pick a free slot.
        </Alert>
      )}
      <Group gap="sm">
        <Select label="Doctor" data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={(v) => set('doctor', v)} searchable allowDeselect={false} w={260} />
        <Group gap={4} align="flex-end">
          <ActionIcon variant="default" size="lg" onClick={() => set('date', addDays(date, -1))} aria-label="Previous day">
            <IconChevronLeft size={16} />
          </ActionIcon>
          <DatePickerInput label="Day" valueFormat="DD-MM-YYYY" value={date} onChange={(d) => set('date', toYmd(d))} w={150} />
          <ActionIcon variant="default" size="lg" onClick={() => set('date', addDays(date, 1))} aria-label="Next day">
            <IconChevronRight size={16} />
          </ActionIcon>
          <Button variant="subtle" onClick={() => set('date', null)}>
            Today
          </Button>
        </Group>
      </Group>
      {day && <DayView day={day} onBook={setBooking} />}
      {booking && day && <BookModal slot={booking} day={day} presetPatient={presetPatient ?? null} onClose={() => setBooking(null)} onBooked={() => { setBooking(null); set('patient', null) }} />}
    </Stack>
  )
}

function DayView({ day, onBook }: { day: DaySlots; onBook: (s: Slot) => void }) {
  const canBook = useCan('opd.appointments.create')
  if (day.onLeave)
    return (
      <Alert color="red" icon={<IconCalendarOff />} title={formatLongDate(`${day.date}T06:00:00Z`)}>
        {day.onLeave}. No appointments can be booked.
      </Alert>
    )
  if (!day.sessions.length)
    return (
      <Card withBorder radius="md" py="xl">
        <Text c="dimmed" ta="center">
          No OPD session on {formatLongDate(`${day.date}T06:00:00Z`)}. Timings are set in Masters → Schedules.
        </Text>
      </Card>
    )
  return (
    <Stack>
      {day.sessions.map((s) => (
        <Card key={s.scheduleId} withBorder radius="md">
          <Group justify="space-between" mb="sm">
            <Text fw={600}>
              {formatClock(s.start)} – {formatClock(s.end)}
              {s.room ? ` · ${s.room}` : ''}
            </Text>
            <Text size="sm" c="dimmed">
              {s.booked} booked of {s.slots.length} slots{s.walkInQuota ? ` · ${s.walkInQuota} kept for walk-ins` : ''}
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 4, md: 6, lg: 8 }} spacing={8}>
            {s.slots.map((slot) =>
              slot.appointment ? (
                <BookedSlot key={slot.time} slot={slot} />
              ) : (
                <UnstyledButton
                  key={slot.time}
                  disabled={slot.past || !canBook}
                  onClick={() => onBook(slot)}
                  aria-label={`Book ${slot.time}`}
                  p={8}
                  style={{
                    border: '1px dashed var(--mantine-color-gray-4)',
                    borderRadius: 8,
                    opacity: slot.past ? 0.4 : 1,
                    cursor: slot.past || !canBook ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Text size="sm" fw={600}>
                    {formatClock(slot.time)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {slot.past ? 'past' : 'free'}
                  </Text>
                </UnstyledButton>
              ),
            )}
          </SimpleGrid>
        </Card>
      ))}
    </Stack>
  )
}

const APPT_COLOR = { booked: 'blue', arrived: 'teal', noShow: 'red', cancelled: 'gray' } as const

function BookedSlot({ slot }: { slot: Slot }) {
  const a = slot.appointment!
  const navigate = useNavigate()
  const canCheckIn = useCan('opd.checkin.create')
  const canEdit = useCan('opd.appointments.edit')
  const canCancel = useCan('opd.appointments.cancel')
  const [dialog, setDialog] = useState<'cancel' | 'move' | 'history' | null>(null)
  return (
    <>
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <UnstyledButton p={8} style={{ borderRadius: 8, background: `var(--mantine-color-${APPT_COLOR[a.status]}-0)`, border: `1px solid var(--mantine-color-${APPT_COLOR[a.status]}-3)` }} aria-label={`${slot.time} ${a.patient.name}`}>
            <Group gap={4} justify="space-between" wrap="nowrap">
              <Text size="sm" fw={600}>
                {formatClock(slot.time)}
              </Text>
              {a.status !== 'booked' && (
                <Badge size="xs" color={APPT_COLOR[a.status]}>
                  {a.status === 'noShow' ? 'no-show' : a.status}
                </Badge>
              )}
            </Group>
            <Text size="xs" truncate>
              {a.patient.name}
            </Text>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>
            {a.patient.name} · {a.patient.uhid}
          </Menu.Label>
          {a.status === 'booked' && canCheckIn && (
            <Menu.Item leftSection={<IconUserCheck size={16} />} onClick={() => navigate(`/opd/checkin?patient=${a.patientId}&appointment=${a.id}&doctor=${a.doctorId}`)}>
              Patient arrived: check in
            </Menu.Item>
          )}
          {a.status === 'booked' && canEdit && (
            <Menu.Item leftSection={<IconArrowsExchange size={16} />} onClick={() => setDialog('move')}>
              Reschedule
            </Menu.Item>
          )}
          {a.status === 'booked' && canCancel && (
            <Menu.Item leftSection={<IconX size={16} />} color="red" onClick={() => setDialog('cancel')}>
              Cancel appointment
            </Menu.Item>
          )}
          <Menu.Item leftSection={<IconHistory size={16} />} onClick={() => setDialog('history')}>
            History
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {dialog === 'cancel' && <CancelModal id={a.id} name={a.patient.name} onClose={() => setDialog(null)} />}
      {dialog === 'move' && <MoveModal id={a.id} doctorId={a.doctorId} date={a.date} onClose={() => setDialog(null)} />}
      {dialog === 'history' && (
        <Modal opened onClose={() => setDialog(null)} title={`Appointment history · ${a.patient.name}`}>
          <Timeline bulletSize={12}>
            {a.history.map((h, i) => (
              <Timeline.Item key={i} title={h.action}>
                <Text size="xs" c="dimmed">
                  {formatDateTime(h.at)} · {h.by}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Modal>
      )}
    </>
  )
}

function BookModal({ slot, day, presetPatient, onClose, onBooked }: { slot: Slot; day: DaySlots; presetPatient: PatientBrief | null; onClose: () => void; onBooked: () => void }) {
  const [patient, setPatient] = useState<PatientBrief | null>(presetPatient)
  const book = useBookAppointment()
  const submit = () =>
    patient &&
    book.mutate(
      { patientId: patient.id, doctorId: day.doctorId, date: day.date, slot: slot.time },
      { onSuccess: () => { notifySaved(`Booked ${patient.name} at ${formatClock(slot.time)}. Confirmation SMS goes out with the SMS integration.`); onBooked() }, onError: (e) => showApiError(e) },
    )
  return (
    <Modal opened onClose={onClose} title={`Book ${formatClock(slot.time)} · ${formatLongDate(`${day.date}T06:00:00Z`)}`} size="lg">
      <Stack>
        {patient ? (
          <Group justify="space-between">
            <PatientBadge patient={patient} />
            <Button variant="subtle" size="xs" onClick={() => setPatient(null)}>
              Change
            </Button>
          </Group>
        ) : (
          <PatientPicker autoFocus onPick={setPatient} />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!patient} loading={book.isPending} data-autofocus={!!patient || undefined}>
            Book appointment
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function CancelModal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const cancel = useCancelAppointment()
  const [reason, setReason] = useState('')
  return (
    <Modal opened onClose={onClose} title={`Cancel ${name}'s appointment?`}>
      <Stack>
        <TextInput label="Reason" withAsterisk data-autofocus value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder="e.g. Patient called to cancel" />
        <Text size="xs" c="dimmed">
          The slot becomes free again. The appointment stays in the history.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Keep
          </Button>
          <Button color="red" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate({ id, reason }, { onSuccess: () => { notifySaved('Appointment cancelled.'); onClose() }, onError: (e) => showApiError(e) })}>
            Cancel appointment
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function MoveModal({ id, doctorId, date: from, onClose }: { id: string; doctorId: string; date: string; onClose: () => void }) {
  const [date, setDate] = useState(from)
  const { data: day } = useDaySlots(doctorId, date)
  const move = useRescheduleAppointment()
  const free = (day?.sessions ?? []).flatMap((s) => s.slots).filter((s) => !s.appointment && !s.past)
  return (
    <Modal opened onClose={onClose} title="Reschedule appointment" size="lg">
      <Stack>
        <DatePickerInput label="New day" valueFormat="DD-MM-YYYY" value={date} onChange={(d) => setDate(toYmd(d))} minDate={todayIST()} w={180} />
        {day?.onLeave && <Alert color="red">{day.onLeave}</Alert>}
        <SimpleGrid cols={{ base: 3, sm: 6 }} spacing={6}>
          {free.map((s) => (
            <Button key={s.time} variant="default" size="xs" onClick={() => move.mutate({ id, to: { doctorId, date, slot: s.time } }, { onSuccess: () => { notifySaved('Appointment moved.'); onClose() }, onError: (e) => showApiError(e) })}>
              {formatClock(s.time)}
            </Button>
          ))}
        </SimpleGrid>
        {free.length === 0 && !day?.onLeave && (
          <Text size="sm" c="dimmed">
            No free slots that day.
          </Text>
        )}
      </Stack>
    </Modal>
  )
}
