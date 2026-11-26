import { Alert, Badge, Button, Card, Grid, Group, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { IconCalendarPlus, IconId, IconPencil, IconShieldCheck, IconUserCheck } from '@tabler/icons-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { formatDateTime, formatDay, todayIST } from '@/lib/dates'
import { showApiError } from '@/lib/apiErrors'
import { useIntegrationSettings } from '../setup/queries'
import { useValueList } from '../masters/queries'
import { patientAgeSex } from './format'
import { usePatient, useVerifyAbha } from './queries'
import { VisitFlow } from './VisitFlow'
import { VisitStatusBadge } from './VisitStatusBadge'

export function PatientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: p, isError } = usePatient(id)
  const { data: categories } = useValueList('patientCategory')
  const { data: integrations } = useIntegrationSettings()
  const canEdit = useCan('opd.registration.edit')
  const verifyAbha = useVerifyAbha()
  if (isError) return <Alert color="red">Patient not found.</Alert>
  if (!p) return <Loader />
  const row = (label: string, value?: string | null) =>
    value ? (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed" w={130}>
          {label}
        </Text>
        <Text size="sm">{value}</Text>
      </Group>
    ) : null

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} fz="h3">
            {p.name}
          </Title>
          <Group gap="xs">
            <Text ff="monospace" c="teal.8" fw={600}>
              {p.uhid}
            </Text>
            <Text c="dimmed">· {patientAgeSex(p)}</Text>
            <Badge variant="light" color="gray">
              {categories?.find((c) => c.code === p.category)?.label ?? p.category}
            </Badge>
          </Group>
        </div>
        <Group gap="xs">
          <Can permission="opd.checkin.create">
            <Button leftSection={<IconUserCheck size={16} />} component={Link} to={`/opd/checkin?patient=${p.id}`}>
              Check in
            </Button>
          </Can>
          <Can permission="opd.appointments.create">
            <Button variant="light" leftSection={<IconCalendarPlus size={16} />} component={Link} to={`/opd/appointments?patient=${p.id}`}>
              Book appointment
            </Button>
          </Can>
          <Can permission="opd.registration.edit">
            <Button variant="default" leftSection={<IconPencil size={16} />} onClick={() => navigate(`/opd/patients/${p.id}/edit`)}>
              Edit
            </Button>
          </Can>
          <Can permission="opd.registration.print">
            <Button variant="default" leftSection={<IconId size={16} />} component="a" href={`/print/uhid/${p.id}`} target="_blank">
              UHID card
            </Button>
          </Can>
        </Group>
      </Group>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder radius="md">
            <Stack gap={6}>
              {row('Mobile', p.mobile)}
              {row('Alternate mobile', p.altMobile)}
              {row('Email', p.email)}
              {row('Address', [p.addressLine, p.city, p.pinCode].filter(Boolean).join(', '))}
              {row('Date of birth', `${formatDay(p.dob)}${p.dobApprox ? ' (approximate)' : ''}`)}
              {p.abhaNumber && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" c="dimmed" w={130}>
                    ABHA
                  </Text>
                  <Text size="sm">{p.abhaNumber}</Text>
                  {p.abhaVerifiedAt ? (
                    <Badge size="sm" color="teal" variant="light" leftSection={<IconShieldCheck size={12} />}>
                      Verified
                    </Badge>
                  ) : integrations?.abdmEnabled && canEdit ? (
                    <Button
                      size="compact-xs"
                      variant="default"
                      loading={verifyAbha.isPending}
                      onClick={() => verifyAbha.mutate(p.id, { onError: (e) => showApiError(e) })}
                    >
                      Verify (simulated)
                    </Button>
                  ) : (
                    <Badge size="sm" color="gray" variant="light">
                      Not verified
                    </Badge>
                  )}
                </Group>
              )}
              {row('Guardian', p.guardianName)}
              {p.allergies.length > 0 && (
                <Group gap="xs">
                  <Text size="sm" c="dimmed" w={130}>
                    Allergies
                  </Text>
                  {p.allergies.map((a) => (
                    <Badge key={a} color="red" variant="light">
                      {a}
                    </Badge>
                  ))}
                </Group>
              )}
              {row('Conditions', p.chronicConditions.join(', '))}
              {row('Registered', formatDateTime(p.createdAt))}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          {p.visits
            .filter((v) => v.date === todayIST() && !['cancelled', 'noShow'].includes(v.status))
            .map((v) => (
              <Card key={v.id} withBorder radius="md" mb="md">
                <Text fw={600} mb="xs">
                  Today · token {v.token} · {v.doctorName}
                </Text>
                <VisitFlow visit={v} />
              </Card>
            ))}
          <Card withBorder radius="md" p={0}>
            <Text fw={600} p="sm">
              Visits ({p.visits.length})
            </Text>
            <Table verticalSpacing={8} highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Visit no.</Table.Th>
                  <Table.Th>Doctor</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {p.visits.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed" ta="center" py="md">
                        No visits yet.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {p.visits.map((v) => (
                  <Table.Tr key={v.id}>
                    <Table.Td>{formatDay(v.date)}</Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {v.visitNo}
                      </Text>
                    </Table.Td>
                    <Table.Td>{v.doctorName}</Table.Td>
                    <Table.Td>{v.visitTypeLabel}</Table.Td>
                    <Table.Td>
                      <VisitStatusBadge status={v.status} />
                    </Table.Td>
                    <Table.Td>
                      {v.status === 'completed' && (
                        <Can permission="opd.prescription.print">
                          <Button size="compact-xs" variant="subtle" component="a" href={`/print/rx/${v.id}`} target="_blank">
                            Prescription
                          </Button>
                        </Can>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
