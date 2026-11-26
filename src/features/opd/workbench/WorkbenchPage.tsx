import { Alert, Badge, Button, Card, Group, Select, Stack, Table, Text, Title } from '@mantine/core'
import { IconSpeakerphone, IconStethoscope } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatTime } from '@/lib/dates'
import { useDoctors } from '../../masters/queries'
import { patientAgeSex } from '../format'
import { useCallNext, useCallVisit, useVisits } from '../queries'
import { MlcBadge } from '../MlcBadge'
import { VisitStatusBadge } from '../VisitStatusBadge'

/** OPD Spec screen 8: today's patients for the doctor, call next, open the consultation. */
export function WorkbenchPage() {
  const { data: session } = useSession()
  const myDoctor = session?.user.doctorId ?? null
  const [picked, setPicked] = useState<string | null>(null)
  const doctorId = myDoctor ?? picked
  const { data: doctors } = useDoctors()
  const { data: visits } = useVisits({ doctorId: doctorId ?? undefined }, 4000)
  const canCall = useCan('opd.queue.edit')
  const callNext = useCallNext()
  const call = useCallVisit()
  const navigate = useNavigate()
  const rows = doctorId ? (visits ?? []) : []
  const inside = rows.find((v) => v.status === 'inConsultation')
  const waiting = rows.filter((v) => ['checkedIn', 'billed', 'vitalsDone'].includes(v.status))
  const done = rows.filter((v) => v.status === 'completed')

  return (
    <Stack gap="lg">
      <PageHeader
        title="Doctor workbench"
        subtitle={myDoctor ? 'Your patients today.' : 'Pick a doctor to see their queue.'}
        actions={
          !myDoctor && (
            <Select
              placeholder="Choose doctor"
              data={(doctors ?? []).map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              value={picked}
              onChange={setPicked}
              searchable
              w={240}
              aria-label="Doctor"
            />
          )
        }
      />
      {doctorId && (
        <Card withBorder radius="md" bg={inside ? 'orange.0' : undefined}>
          <Group justify="space-between">
            {inside ? (
              <Group>
                <Title order={2}>{inside.token}</Title>
                <div>
                  <Text fw={700}>{inside.patient.name}</Text>
                  <Text size="sm" c="dimmed">
                    {patientAgeSex(inside.patient)} · {inside.visitTypeLabel} · in the room since {formatTime(inside.calledAt!)}
                  </Text>
                </div>
              </Group>
            ) : (
              <Text c="dimmed">No patient in the room.</Text>
            )}
            <Group>
              {inside && (
                <Button size="md" leftSection={<IconStethoscope size={18} />} onClick={() => navigate(`/opd/workbench/${inside.id}`)} autoFocus>
                  Open consultation
                </Button>
              )}
              {canCall && !inside && (
                <Button
                  size="md"
                  leftSection={<IconSpeakerphone size={18} />}
                  loading={callNext.isPending}
                  autoFocus
                  onClick={() =>
                    callNext.mutate(doctorId, {
                      onSuccess: (v) => (v ? navigate(`/opd/workbench/${v.id}`) : notifySaved('Nobody is waiting.')),
                      onError: (e) => showApiError(e),
                    })
                  }
                >
                  Call next patient
                </Button>
              )}
            </Group>
          </Group>
        </Card>
      )}
      {doctorId && (
        <Card withBorder radius="md" p={0}>
          <Text fw={600} p="sm">
            Waiting ({waiting.length})
          </Text>
          <Table verticalSpacing={8} highlightOnHover>
            <Table.Tbody>
              {waiting.length === 0 && (
                <Table.Tr>
                  <Table.Td>
                    <Text c="dimmed" ta="center" py="sm" size="sm">
                      No one waiting.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {waiting.map((v) => (
                <Table.Tr key={v.id}>
                  <Table.Td w={50}>
                    <Text fw={700}>{v.token}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Text size="sm" fw={500}>
                        {v.patient.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {patientAgeSex(v.patient)}
                      </Text>
                      {v.patient.allergies.length > 0 && (
                        <Badge size="xs" color="red" variant="light">
                          allergy
                        </Badge>
                      )}
                      {v.priority && (
                        <Badge size="xs" color="blue">
                          appointment
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {v.visitTypeLabel} · waiting {v.waitingMinutes} min
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <VisitStatusBadge status={v.status} />
                      <MlcBadge mlc={v.mlc} size="xs" />
                      {!v.consultPaid && !v.waiveConsultation && (
                        <Badge size="xs" color="red" variant="light">
                          not paid
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    {canCall && !inside && (
                      <Button
                        size="compact-sm"
                        variant="light"
                        onClick={() =>
                          call.mutate(v.id, {
                            onSuccess: () => navigate(`/opd/workbench/${v.id}`),
                            onError: (e) => showApiError(e),
                          })
                        }
                      >
                        Call in
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
      {doctorId && done.length > 0 && (
        <Card withBorder radius="md" p={0}>
          <Text fw={600} p="sm">
            Seen today ({done.length})
          </Text>
          <Table verticalSpacing={6} highlightOnHover>
            <Table.Tbody>
              {done.map((v) => (
                <Table.Tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/opd/workbench/${v.id}`)}>
                  <Table.Td w={50}>{v.token}</Table.Td>
                  <Table.Td>{v.patient.name}</Table.Td>
                  <Table.Td>{v.completedAt ? formatTime(v.completedAt) : ''}</Table.Td>
                  <Table.Td ta="right">
                    {v.pendingCharges > 0 && (
                      <Badge size="xs" color="orange" variant="light">
                        tests to be billed
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
      {!doctorId && <Alert variant="light">Pick a doctor above.</Alert>}
    </Stack>
  )
}
