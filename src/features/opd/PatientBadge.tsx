import { Badge, Group, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { PatientBrief } from '@/types/opd'
import { patientAgeSex } from './format'
import { TempBadge } from './MlcBadge'

/** Name, UHID, age/sex and allergies: the patient line used on every OPD screen. */
export function PatientBadge({ patient, size = 'sm' }: { patient: PatientBrief; size?: 'sm' | 'lg' }) {
  return (
    <Stack gap={2}>
      <Group gap={6} wrap="nowrap">
        <Text fw={700} size={size === 'lg' ? 'lg' : 'sm'}>
          {patient.name}
        </Text>
        <Text size={size === 'lg' ? 'sm' : 'xs'} c="dimmed">
          {patientAgeSex(patient)}
        </Text>
        <TempBadge temporary={patient.temporary} size="xs" />
      </Group>
      <Group gap={6}>
        <Text size="xs" ff="monospace" c="dimmed">
          {patient.uhid}
        </Text>
        {patient.mobile && (
          <Text size="xs" c="dimmed">
            · {patient.mobile}
          </Text>
        )}
        {patient.allergies.length > 0 && (
          <Badge size="xs" color="red" variant="light" leftSection={<IconAlertTriangle size={10} />}>
            Allergy: {patient.allergies.join(', ')}
          </Badge>
        )}
      </Group>
    </Stack>
  )
}
