import { Alert, Badge, Button, Card, Checkbox, Grid, Group, Modal, Select, Stack, Table, Text, TextInput, ThemeIcon, Title } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconAlertTriangle, IconCheck, IconPrinter, IconUserCheck, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { PageHeader } from '@/components/PageHeader'
import { showApiError } from '@/lib/apiErrors'
import { formatDay, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import type { PatientBrief, VisitRow } from '@/types/opd'
import { useDoctors, usePanels, useValueList } from '../masters/queries'
import { EmergencyButton } from './EmergencyButton'
import { PatientBadge } from './PatientBadge'
import { VisitFlow } from './VisitFlow'
import { PatientPicker } from './PatientPicker'
import { useAppointments, useCheckIn, useCheckInPreview, usePatient } from './queries'

/** OPD Spec screen 4: create the visit, choose doctor and visit type, issue the token. */
export function CheckInPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const patientId = params.get('patient')
  const appointmentId = params.get('appointment') ?? undefined
  const { data: patient } = usePatient(patientId)
  const [done, setDone] = useState<VisitRow | null>(null)
  const today = todayIST()
  const { data: appointments } = useAppointments(today)
  const expected = (appointments ?? []).filter((a) => a.status === 'booked')

  const pick = (id: string, appointment?: { id: string; doctorId: string }) => {
    const next = new URLSearchParams({ patient: id })
    if (appointment) {
      next.set('appointment', appointment.id)
      next.set('doctor', appointment.doctorId)
    }
    setParams(next)
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Check-in" subtitle="Find the patient, pick the doctor, and give a token. The visit type and fee are worked out for you." actions={<EmergencyButton />} />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack>
            <Card withBorder radius="md">
              <Text fw={600} mb="xs">
                1. Patient
              </Text>
              {patient ? (
                <Group justify="space-between" wrap="nowrap">
                  <PatientBadge patient={patient} size="lg" />
                  <Button variant="subtle" size="xs" leftSection={<IconX size={14} />} onClick={() => setParams({})}>
                    Change
                  </Button>
                </Group>
              ) : (
                <PatientPicker autoFocus onPick={(p: PatientBrief) => pick(p.id)} onRegister={(prefill) => navigate(`/opd/checkin/register?prefill=${encodeURIComponent(prefill)}`)} />
              )}
            </Card>
            <Card withBorder radius="md" p={0}>
              <Text fw={600} p="sm">
                Expected today ({expected.length})
              </Text>
              <Table verticalSpacing={6} highlightOnHover>
                <Table.Tbody>
                  {expected.length === 0 && (
                    <Table.Tr>
                      <Table.Td>
                        <Text size="sm" c="dimmed" ta="center" py="sm">
                          No booked appointments left today.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {expected.map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td w={60}>
                        <Text size="sm" fw={600}>
                          {a.slot}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{a.patient.name}</Text>
                        <Text size="xs" c="dimmed">
                          {a.doctorName}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Button size="compact-xs" variant="light" onClick={() => pick(a.patientId, a)}>
                          Arrived
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          {patient ? (
            <CheckInForm key={`${patient.id}:${appointmentId ?? ''}`} patient={patient} appointmentId={appointmentId} doctorFromLink={params.get('doctor')} onDone={setDone} />
          ) : (
            <Card withBorder radius="md" py="xl">
              <Text c="dimmed" ta="center">
                Pick a patient on the left, or click “Arrived” for an appointment.
              </Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>
      <TokenModal visit={done} onClose={() => {
        setDone(null)
        setParams({})
      }} />
    </Stack>
  )
}

function CheckInForm({ patient, appointmentId, doctorFromLink, onDone }: { patient: PatientBrief & { category: string }; appointmentId?: string; doctorFromLink: string | null; onDone: (v: VisitRow) => void }) {
  const { data: doctors } = useDoctors()
  const { data: panels } = usePanels()
  const { data: visitTypes } = useValueList('visitType')
  const { data: categories } = useValueList('patientCategory')
  const checkIn = useCheckIn()
  const [doctorId, setDoctorId] = useState<string | null>(doctorFromLink)
  const [payerId, setPayerId] = useState('cash')
  const [category, setCategory] = useState(patient.category)
  const [visitType, setVisitType] = useState<string | undefined>(undefined)
  const [docs, setDocs] = useState<string[]>([])
  const [approvalNo, setApprovalNo] = useState('')
  const { data: preview } = useCheckInPreview({ patientId: patient.id, doctorId, payerId, category, visitType })
  const effectiveType = visitType ?? preview?.visitType
  const panel = panels?.find((p) => p.id === payerId)
  const docsMissing = (preview?.panelNeeds.documents ?? []).filter((d) => !docs.includes(d))

  const submit = () => {
    if (!doctorId || !effectiveType) return
    checkIn.mutate(
      { patientId: patient.id, doctorId, visitType: effectiveType, payerId, category, appointmentId, panelDocuments: docs, panelApprovalNo: approvalNo || undefined },
      { onSuccess: onDone, onError: (e) => showApiError(e) },
    )
  }
  useHotkeys([['mod+Enter', submit]], [])

  return (
    <Card withBorder radius="md">
      <Stack>
        <Text fw={600}>2. Visit</Text>
        {appointmentId && (
          <Badge color="blue" variant="light">
            From appointment: priority token
          </Badge>
        )}
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <Select
              label="Doctor"
              placeholder="Type to search"
              searchable
              data-autofocus
              autoFocus={!doctorId}
              data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))}
              value={doctorId}
              onChange={(v) => {
                setDoctorId(v)
                setVisitType(undefined)
              }}
              withAsterisk
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <Select
              label="Visit type"
              data={(visitTypes ?? []).map((v) => ({ value: v.code, label: v.label }))}
              value={effectiveType ?? null}
              onChange={(v) => setVisitType(v ?? undefined)}
              allowDeselect={false}
              disabled={!doctorId}
              description={visitType && preview && visitType !== preview.visitType ? 'Changed by hand' : 'Worked out automatically'}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <Select
              label="Payer"
              data={[{ value: 'cash', label: 'Cash (self-pay)' }, ...(panels ?? []).map((p) => ({ value: p.id, label: p.name }))]}
              value={payerId}
              onChange={(v) => {
                setPayerId(v ?? 'cash')
                setDocs([])
              }}
              allowDeselect={false}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <Select label="Patient category" data={(categories ?? []).map((c) => ({ value: c.code, label: c.label }))} value={category} onChange={(v) => setCategory(v ?? 'general')} allowDeselect={false} />
          </Grid.Col>
        </Grid>

        {preview && doctorId && (
          <>
            {preview.onLeave && (
              <Alert color="red" icon={<IconAlertTriangle />}>
                Doctor is away today: {preview.onLeave}
              </Alert>
            )}
            {!preview.hasSessionToday && !preview.onLeave && (
              <Alert color="yellow" icon={<IconAlertTriangle />}>
                This doctor has no OPD session today. You can still check the patient in as a walk-in.
              </Alert>
            )}
            {preview.alreadyToday && (
              <Alert color="orange" icon={<IconAlertTriangle />}>
                This patient is already checked in with this doctor today.
              </Alert>
            )}
            <Card bg="gray.0" radius="md" p="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={2}>
                  <Text size="sm" fw={600}>
                    {visitTypes?.find((v) => v.code === effectiveType)?.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {preview.reason}
                  </Text>
                  {preview.lastVisit && (
                    <Text size="xs" c="dimmed">
                      Last paid visit: {formatDay(preview.lastVisit.date)} ({preview.lastVisit.visitType})
                    </Text>
                  )}
                </Stack>
                <Stack gap={0} align="flex-end">
                  <Text size="xl" fw={700} aria-label="Consultation fee">
                    {formatINR(preview.patientPaysPaise)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {preview.panelPaysPaise > 0 ? `${panel?.name} pays ${formatINR(preview.panelPaysPaise)}` : 'patient pays'}
                  </Text>
                </Stack>
              </Group>
            </Card>
            {preview.panelNeeds.documents.length > 0 && (
              <Checkbox.Group label="Documents checked" description={`${panel?.name} needs these before billing`} value={docs} onChange={setDocs}>
                <Group mt={6}>
                  {preview.panelNeeds.documents.map((d) => (
                    <Checkbox key={d} value={d} label={d} />
                  ))}
                </Group>
              </Checkbox.Group>
            )}
            {preview.panelNeeds.priorApproval && <TextInput label="Prior-approval number" withAsterisk value={approvalNo} onChange={(e) => setApprovalNo(e.currentTarget.value)} />}
          </>
        )}

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Ctrl+Enter checks in
          </Text>
          <Button
            size="md"
            leftSection={<IconUserCheck size={18} />}
            onClick={submit}
            loading={checkIn.isPending}
            disabled={!doctorId || !effectiveType || docsMissing.length > 0 || (!!preview?.panelNeeds.priorApproval && !approvalNo)}
          >
            Check in and give token
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

function TokenModal({ visit, onClose }: { visit: VisitRow | null; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <Modal opened={!!visit} onClose={onClose} title="Checked in" centered>
      {visit && (
        <Stack align="center" gap="sm">
          <ThemeIcon size={48} radius="xl" color="teal">
            <IconCheck size={28} />
          </ThemeIcon>
          <Text c="dimmed">{visit.doctorName}{visit.room ? ` · ${visit.room}` : ''}</Text>
          <Title order={1} fz={64} lh={1} aria-label="Token number">
            {visit.token}
          </Title>
          <Text>
            {visit.patient.name} · {visit.visitTypeLabel}
            {visit.priority ? ' · priority' : ''}
          </Text>
          <VisitFlow visit={visit} here="checkin" />
          <Group mt="sm">
            <Can permission="opd.checkin.print">
              <Button leftSection={<IconPrinter size={16} />} component="a" href={`/print/slip/${visit.id}?autoprint=1`} target="_blank" data-autofocus>
                Print token slip
              </Button>
            </Can>
            <Can permission="opd.billing.create">
              <Button variant="light" onClick={() => navigate(`/opd/billing?visit=${visit.id}`)}>
                Go to billing
              </Button>
            </Can>
            <Button variant="default" onClick={onClose}>
              Next patient
            </Button>
          </Group>
          <Text size="xs" c="dimmed" component={Link} to="/opd/queue">
            Open the queue
          </Text>
        </Stack>
      )}
    </Modal>
  )
}
