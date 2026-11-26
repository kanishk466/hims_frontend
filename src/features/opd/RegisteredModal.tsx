import { Button, Group, Modal, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconCalendarPlus, IconCheck, IconId, IconUserCheck } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { Can } from '@/auth/Can'
import type { Patient } from '@/types/opd'

/** After registration: the usual next step is one click (or Enter) away. */
export function RegisteredModal({ patient, onClose }: { patient: Patient | null; onClose: () => void }) {
  const navigate = useNavigate()
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  return (
    <Modal opened={!!patient} onClose={onClose} title="Patient registered" size="md">
      {patient && (
        <Stack>
          <Group gap="sm">
            <ThemeIcon radius="xl" size="lg" color="teal">
              <IconCheck size={20} />
            </ThemeIcon>
            <div>
              <Text fw={700}>{patient.name}</Text>
              <Text ff="monospace" size="lg" c="teal.8">
                {patient.uhid}
              </Text>
            </div>
          </Group>
          <Stack gap="xs">
            <Can permission="opd.checkin.create">
              <Button leftSection={<IconUserCheck size={16} />} onClick={() => go(`/opd/checkin?patient=${patient.id}`)} data-autofocus>
                Check in now
              </Button>
            </Can>
            <Can permission="opd.appointments.create">
              <Button variant="light" leftSection={<IconCalendarPlus size={16} />} onClick={() => go(`/opd/appointments?patient=${patient.id}`)}>
                Book an appointment
              </Button>
            </Can>
            <Can permission="opd.registration.print">
              <Button variant="default" leftSection={<IconId size={16} />} component="a" href={`/print/uhid/${patient.id}?autoprint=1`} target="_blank">
                Print UHID card
              </Button>
            </Can>
            <Button variant="subtle" color="gray" onClick={onClose}>
              Done
            </Button>
          </Stack>
        </Stack>
      )}
    </Modal>
  )
}
