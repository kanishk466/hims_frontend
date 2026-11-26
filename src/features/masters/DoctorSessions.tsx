import { ActionIcon, Badge, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useCan } from '@/auth/useCan'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatClock, formatWeekdays } from '@/lib/india'
import type { Doctor, DoctorSchedule } from '@/types/masters'
import { sessionSummary } from './format'
import { useDepartments, useSchedules, useSetScheduleActive } from './queries'

interface Props {
  doctors: Doctor[]
  autoFocusFirst?: boolean
  /** Called when "Add session"/"Add OPD timings" is clicked for a doctor. */
  onAdd: (doctor: Doctor) => void
  /** Called when a session's edit icon is clicked. */
  onEdit: (doctor: Doctor, schedule: DoctorSchedule) => void
}

/**
 * One card per doctor with their weekly OPD sessions. Used by the wizard and Masters →
 * Schedules — each caller owns its own add/edit form (a modal mid-wizard, a routed page in
 * Masters) and passes it in via onAdd/onEdit, since this component doesn't know which fits.
 */
export function DoctorSessions({ doctors, autoFocusFirst = false, onAdd, onEdit }: Props) {
  const { data: departments } = useDepartments(true)
  const { data: schedules } = useSchedules()
  const remove = useSetScheduleActive()
  const canCreate = useCan('masters.schedules.create')
  const canEdit = useCan('masters.schedules.edit')
  const canCancel = useCan('masters.schedules.cancel')
  const firstUnscheduled = doctors.find((d) => !(schedules ?? []).some((s) => s.doctorId === d.id))?.id

  return (
    <Stack gap="sm">
      {doctors.map((d) => {
        const rows = (schedules ?? []).filter((s) => s.doctorId === d.id)
        return (
          <Card key={d.id} withBorder radius="md" padding="sm" style={rows.length ? undefined : { borderColor: 'var(--mantine-color-orange-3)' }}>
            <Group justify="space-between" mb={rows.length ? 'xs' : 0} wrap="nowrap">
              <div>
                <Text fw={600} size="sm">
                  {d.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {departments?.find((x) => x.id === d.departmentId)?.name}
                </Text>
              </div>
              {canCreate && (
                <Button
                  size="compact-sm"
                  variant={rows.length ? 'subtle' : 'light'}
                  leftSection={<IconPlus size={14} />}
                  onClick={() => onAdd(d)}
                  autoFocus={autoFocusFirst && firstUnscheduled === d.id}
                >
                  {rows.length ? 'Add session' : 'Add OPD timings'}
                </Button>
              )}
            </Group>
            {rows.map((s) => (
              <Group key={s.id} justify="space-between" py={6} px="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }} wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                  <Badge variant="light" w={92}>
                    {formatWeekdays(s.weekdays)}
                  </Badge>
                  <Text size="sm" fw={500} w={170}>
                    {formatClock(s.start)} – {formatClock(s.end)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {sessionSummary(s)}
                  </Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                  {canEdit && (
                    <Tooltip label="Edit session">
                      <ActionIcon variant="subtle" color="gray" onClick={() => onEdit(d, s)} aria-label="Edit session">
                        <IconPencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {canCancel && (
                    <Tooltip label="Remove session">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Remove session"
                        onClick={() => remove.mutate({ id: s.id, active: false }, { onSuccess: () => notifySaved('Session removed.'), onError: (e) => showApiError(e) })}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            ))}
          </Card>
        )
      })}
    </Stack>
  )
}
