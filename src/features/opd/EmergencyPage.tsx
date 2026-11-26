import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Card, Grid, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Switch, Table, Text, TextInput, Textarea, Title } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconAmbulance, IconPrinter, IconUserCheck, IconUserPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatTime } from '@/lib/dates'
import { emergencyInputSchema, type EmergencyInput, type PatientBrief, type VisitRow } from '@/types/opd'
import { MlcBadge, TempBadge } from './MlcBadge'
import { PatientPicker } from './PatientPicker'
import { patientAgeSex } from './format'
import { useEmergencyContext, useMergeTemporaryPatient, useRegisterEmergency } from './queries'
import { VisitStatusBadge } from './VisitStatusBadge'

const blank = (doctorId: string | null): EmergencyInput => ({ name: '', gender: undefined as unknown as EmergencyInput['gender'], approxAge: undefined as unknown as number, mobile: '', broughtBy: '', complaint: '', doctorId: doctorId ?? '', isMlc: false, policeStation: '', mlcNo: '', officerName: '' })

/**
 * Casualty (OPD-14): register an unknown or unconscious patient in seconds, straight into the
 * duty doctor's E-token queue; identify the patient later by merging or completing the record.
 */
export function EmergencyPage() {
  const { data: ctx } = useEmergencyContext()
  const canCreate = useCan('opd.emergency.create')
  const location = useLocation()
  const navigate = useNavigate()
  const [done, setDone] = useState<VisitRow | null>(null)
  const [identify, setIdentify] = useState<PatientBrief | null>(() => (location.state as { identifyTemp?: PatientBrief } | null)?.identifyTemp ?? null)
  const [identifyTarget] = useState<PatientBrief | null>(() => (location.state as { identifyTarget?: PatientBrief } | null)?.identifyTarget ?? null)

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
    // Only on mount: this consumes router state exactly once, not whenever it's re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Stack gap="lg">
      <PageHeader
        title="Emergency"
        subtitle="Minimal details now, full registration later. Casualty patients are seen before they pay."
        actions={
          ctx && (
            <Text size="sm" c="dimmed">
              On duty: {ctx.doctors.filter((d) => d.onDuty).map((d) => d.name).join(', ') || 'nobody now'}
            </Text>
          )
        }
      />
      {ctx && ctx.doctors.length === 0 && (
        <Alert color="orange">No casualty doctor is set up. Mark a department as “Casualty / emergency” in Masters → Departments and add its doctors and duty timings.</Alert>
      )}
      <Grid gap="lg">
        {canCreate && ctx && ctx.doctors.length > 0 && (
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <EmergencyForm doctors={ctx.doctors} defaultDoctorId={ctx.defaultDoctorId} onDone={setDone} />
          </Grid.Col>
        )}
        <Grid.Col span={{ base: 12, lg: canCreate ? 7 : 12 }}>
          <Stack gap="lg">
            <Card withBorder radius="md" p={0}>
              <Group justify="space-between" p="sm">
                <Text fw={600}>To identify ({ctx?.toIdentify.length ?? 0})</Text>
                <Text size="xs" c="dimmed">
                  Merge with an existing record, or complete the details for a new UHID
                </Text>
              </Group>
              <Table verticalSpacing={8}>
                <Table.Tbody>
                  {ctx?.toIdentify.length === 0 && (
                    <Table.Tr>
                      <Table.Td>
                        <Text c="dimmed" size="sm" ta="center" py="xs">
                          Everyone is identified.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {ctx?.toIdentify.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Group gap={6}>
                          <Text size="sm" fw={600}>
                            {p.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {patientAgeSex(p)}
                          </Text>
                          <MlcBadge mlc={p.visit?.mlc} size="xs" />
                        </Group>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {p.uhid} · arrived {formatTime(p.createdAt)}
                          {p.visit ? ` · token ${p.visit.token} · ${p.visit.doctorName}` : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Can permission="opd.emergency.edit">
                          <Button size="compact-sm" variant="light" leftSection={<IconUserCheck size={14} />} onClick={() => setIdentify(p)}>
                            Identify
                          </Button>
                        </Can>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
            <Card withBorder radius="md" p={0}>
              <Text fw={600} p="sm">
                Casualty today
              </Text>
              <Table verticalSpacing={6} highlightOnHover>
                <Table.Tbody>
                  {ctx?.today.length === 0 && (
                    <Table.Tr>
                      <Table.Td>
                        <Text c="dimmed" size="sm" ta="center" py="xs">
                          No emergency patients today.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {ctx?.today.map((v) => (
                    <Table.Tr key={v.id}>
                      <Table.Td w={50}>
                        <Text fw={800} c="red.7">
                          {v.token}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            {v.patient.name}
                          </Text>
                          <TempBadge temporary={v.patient.temporary} size="xs" />
                          <MlcBadge mlc={v.mlc} size="xs" />
                        </Group>
                        <Text size="xs" c="dimmed">
                          {formatTime(v.checkedInAt)} · {v.doctorName}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <VisitStatusBadge status={v.status} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
      {done && <RegisteredModal visit={done} onClose={() => setDone(null)} />}
      {identify && <IdentifyModal temp={identify} initialTarget={identifyTarget} onClose={() => setIdentify(null)} />}
    </Stack>
  )
}

function EmergencyForm({ doctors, defaultDoctorId, onDone }: { doctors: { id: string; name: string; onDuty: boolean }[]; defaultDoctorId: string | null; onDone: (v: VisitRow) => void }) {
  const register = useRegisterEmergency()
  const { control, register: field, handleSubmit, reset, setError, formState } = useForm<EmergencyInput>({ resolver: zodResolver(emergencyInputSchema), defaultValues: blank(defaultDoctorId) })
  const isMlc = useWatch({ control, name: 'isMlc' })
  const e = formState.errors
  useEffect(() => reset(blank(defaultDoctorId)), [defaultDoctorId, reset])

  const submit = handleSubmit((input) =>
    register.mutate(input, {
      onSuccess: (v) => {
        reset(blank(defaultDoctorId))
        onDone(v)
      },
      onError: (err) => showApiError(err, setError),
    }),
  )
  useHotkeys([['mod+Enter', () => submit()]], [])

  return (
    <Card withBorder radius="md" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
      <form onSubmit={submit} noValidate>
        <Stack gap="sm">
          <Group gap="xs">
            <IconAmbulance color="var(--mantine-color-red-6)" />
            <Title order={4}>Quick registration</Title>
          </Group>
          <Controller
            control={control}
            name="gender"
            render={({ field: f }) => (
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Gender <span style={{ color: 'var(--mantine-color-red-6)' }}>*</span>
                </Text>
                <SegmentedControl
                  fullWidth
                  value={f.value ?? ''}
                  onChange={f.onChange}
                  data={[
                    { value: 'M', label: 'Male' },
                    { value: 'F', label: 'Female' },
                    { value: 'O', label: 'Not known' },
                  ]}
                />
                {e.gender && (
                  <Text size="xs" c="red">
                    {e.gender.message}
                  </Text>
                )}
              </Stack>
            )}
          />
          <Group grow align="flex-start">
            <Controller
              control={control}
              name="approxAge"
              render={({ field: f }) => <NumberInput label="Approximate age" withAsterisk min={0} max={120} hideControls value={f.value ?? ''} onChange={(v) => f.onChange(typeof v === 'number' ? v : undefined)} error={e.approxAge?.message} data-autofocus />}
            />
            <TextInput label="Name, if known" placeholder="Leave empty: “Unknown male”" {...field('name')} />
          </Group>
          <Group grow align="flex-start">
            <TextInput label="Brought by" placeholder="108 ambulance, relative, police…" {...field('broughtBy')} />
            <TextInput label="Attendant’s mobile" maxLength={10} {...field('mobile')} error={e.mobile?.message} />
          </Group>
          <Textarea label="What happened" placeholder="Road accident, fall, chest pain, poisoning…" autosize minRows={1} {...field('complaint')} />
          <Controller
            control={control}
            name="doctorId"
            render={({ field: f }) => (
              <Select label="Duty doctor" withAsterisk data={doctors.map((d) => ({ value: d.id, label: `${d.name}${d.onDuty ? ' (on duty)' : ''}` }))} value={f.value || null} onChange={(v) => f.onChange(v ?? '')} allowDeselect={false} error={e.doctorId?.message} />
            )}
          />
          <Controller control={control} name="isMlc" render={({ field: f }) => <Switch label="Medico-legal case (MLC)" description="Accident, assault, burns, poisoning, unknown cause… MLC visits can never be cancelled." checked={f.value} onChange={(ev) => f.onChange(ev.currentTarget.checked)} color="red" />} />
          {isMlc && (
            <Card withBorder bg="red.0" p="sm">
              <Stack gap="xs">
                <TextInput label="Police station" withAsterisk {...field('policeStation')} error={e.policeStation?.message} />
                <Group grow align="flex-start">
                  <TextInput label="MLC number" withAsterisk {...field('mlcNo')} error={e.mlcNo?.message} />
                  <TextInput label="Officer (name, buckle no.)" {...field('officerName')} />
                </Group>
              </Stack>
            </Card>
          )}
          <Button type="submit" color="red" size="md" loading={register.isPending} leftSection={<IconAmbulance size={18} />} title="Ctrl+Enter">
            Register and send to casualty
          </Button>
        </Stack>
      </form>
    </Card>
  )
}

function RegisteredModal({ visit, onClose }: { visit: VisitRow; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <Modal opened onClose={onClose} title="Sent to casualty" centered>
      <Stack align="center" gap="xs">
        <Text size="sm" c="dimmed">
          Token
        </Text>
        <Title order={1} fz={64} c="red.7" lh={1}>
          {visit.token}
        </Title>
        <Group gap={6}>
          <Text fw={600}>{visit.patient.name}</Text>
          <MlcBadge mlc={visit.mlc} />
        </Group>
        <Text size="sm" c="dimmed" ff="monospace">
          {visit.patient.uhid} · {visit.doctorName}
        </Text>
        <Group mt="sm">
          <Can permission="opd.checkin.print">
            <Button leftSection={<IconPrinter size={16} />} component="a" href={`/print/slip/${visit.id}?autoprint=1`} target="_blank" data-autofocus>
              Print slip
            </Button>
          </Can>
          <Can permission="opd.workbench.view">
            <Button variant="default" onClick={() => navigate(`/opd/workbench/${visit.id}`)}>
              Open for the doctor
            </Button>
          </Can>
          <Button variant="subtle" onClick={onClose}>
            Next patient
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/**
 * Identify: merge into the registered record, or complete the details for a new UHID.
 * The latter (Stage 7-Patients) is its own routed page — `IdentifyEmergencyPatientPage` — since
 * it's a full CRUD form; this modal keeps only the existing-vs-new chooser and the
 * merge-into-existing flow, which are workflow UI rather than a CRUD form.
 */
function IdentifyModal({ temp, initialTarget, onClose }: { temp: PatientBrief; initialTarget: PatientBrief | null; onClose: () => void }) {
  const navigate = useNavigate()
  const [target, setTarget] = useState<PatientBrief | null>(initialTarget)
  const merge = useMergeTemporaryPatient()

  return (
    <Modal opened onClose={onClose} title={`Identify ${temp.uhid}`} size="lg">
      <Stack>
        <Text size="sm">
          {temp.name}, {patientAgeSex(temp)}. Has this patient been to the hospital before?
        </Text>
        <SegmentedControl
          value="existing"
          onChange={(v) => {
            if (v === 'new') {
              onClose()
              navigate(`/opd/emergency/identify/${temp.id}`)
            }
          }}
          data={[
            { value: 'existing', label: 'Yes: find their record' },
            { value: 'new', label: 'No: register with full details' },
          ]}
        />
        {!target ? (
          <PatientPicker autoFocus onPick={(p) => (p.id === temp.id || p.temporary ? undefined : setTarget(p))} />
        ) : (
          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text fw={600}>{target.name}</Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  {target.uhid} · {patientAgeSex(target)} · {target.mobile}
                </Text>
              </div>
              <Button variant="subtle" size="compact-sm" onClick={() => setTarget(null)}>
                Change
              </Button>
            </Group>
          </Card>
        )}
        <Alert color="blue" variant="light">
          The casualty visit, vitals, notes and bills move to the chosen record. {temp.uhid} is kept for the audit trail but no longer appears in search.
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!target}
            loading={merge.isPending}
            leftSection={<IconUserPlus size={16} />}
            onClick={() =>
              merge.mutate(
                { tempId: temp.id, targetId: target!.id },
                {
                  onSuccess: (p) => {
                    notifySaved(`Merged into ${p.uhid}`)
                    onClose()
                  },
                  onError: (err) => showApiError(err),
                },
              )
            }
          >
            Merge into {target?.uhid ?? 'this record'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
