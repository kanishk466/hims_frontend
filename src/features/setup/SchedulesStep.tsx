import { Alert, Loader, Stack, Text, Title } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { useState } from 'react'
import type { Doctor, DoctorSchedule } from '@/types/masters'
import { DoctorSessions } from '../masters/DoctorSessions'
import { useDoctors, useSchedules } from '../masters/queries'
import { ScheduleFormModal } from '../masters/ScheduleFormModal'
import { StepFooter } from './StepFooter'

/** Wizard step 4: OPD sessions per doctor. */
export function SchedulesStep({ onNext }: { onNext: () => void }) {
  const { data: doctors } = useDoctors()
  const { data: schedules } = useSchedules()
  const [modal, setModal] = useState<{ doctor: Doctor | null; schedule: DoctorSchedule | null }>({ doctor: null, schedule: null })

  if (!doctors || !schedules) return <Loader />
  const unscheduled = doctors.filter((d) => !schedules.some((s) => s.doctorId === d.id))

  return (
    <Stack gap="lg">
      <div>
        <Title order={3} fz="h4">
          Doctor schedules
        </Title>
        <Text c="dimmed" size="sm">
          OPD days and timings for each doctor. Appointments are booked into these slots; walk-ins work even without a schedule.
        </Text>
      </div>

      {doctors.length === 0 && (
        <Alert color="yellow" icon={<IconAlertCircle />}>
          Add doctors in the previous step first.
        </Alert>
      )}
      {unscheduled.length > 0 && doctors.length > 0 && (
        <Text size="sm" c="orange.8">
          {unscheduled.length} of {doctors.length} doctors have no OPD timings yet.
        </Text>
      )}

      <DoctorSessions doctors={doctors} autoFocusFirst onAdd={(d) => setModal({ doctor: d, schedule: null })} onEdit={(d, s) => setModal({ doctor: d, schedule: s })} />
      <ScheduleFormModal opened={!!modal.doctor} doctor={modal.doctor} schedule={modal.schedule} onClose={() => setModal({ doctor: null, schedule: null })} />

      <StepFooter
        canEdit
        submit={false}
        onContinue={onNext}
        continueDisabled={schedules.length === 0}
        hint={schedules.length === 0 ? 'Add timings for at least one doctor to continue.' : 'Saved as you go. Leave and holidays are in Masters → Schedules.'}
      />
    </Stack>
  )
}
