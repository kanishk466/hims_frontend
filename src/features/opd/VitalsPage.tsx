import { Alert, Badge, Button, Card, Grid, Group, NumberInput, Select, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isApiError } from '@/api/client'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatTime, todayIST } from '@/lib/dates'
import { bmi, vitalFlags } from '@/lib/opd/vitals'
import type { Vitals, VitalsInput, VisitRow } from '@/types/opd'
import { useDoctors } from '../masters/queries'
import { yearsSince } from './format'
import { PatientBadge } from './PatientBadge'
import { useSaveVitals, useVisits, useVitals } from './queries'
import { VisitFlow } from './VisitFlow'
import { VisitStatusBadge } from './VisitStatusBadge'

const OPEN = ['checkedIn', 'billed', 'vitalsDone', 'inConsultation']

/** OPD-06: the nurse records vitals; out-of-range values are highlighted for the doctor. */
export function VitalsPage() {
  const [params, setParams] = useSearchParams()
  const visitId = params.get('visit')
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const { data: visits } = useVisits({ doctorId: doctorId ?? undefined }, 5000)
  const { data: doctors } = useDoctors()
  const open = useMemo(() => (visits ?? []).filter((v) => OPEN.includes(v.status)).sort((a, b) => Number(a.hasVitals) - Number(b.hasVitals) || a.checkedInAt.localeCompare(b.checkedInAt)), [visits])
  const selected = (visits ?? []).find((v) => v.id === visitId)
  const nextWaiting = (afterId: string) => open.find((v) => !v.hasVitals && v.id !== afterId)

  return (
    <Stack gap="lg">
      <PageHeader title="Vitals" subtitle="Patients without vitals are listed first. Values are checked against normal adult ranges." />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder radius="md" p={0}>
            <Select m="sm" placeholder="All doctors" data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={setDoctorId} clearable aria-label="Filter by doctor" />
            <Stack gap={0}>
              {open.length === 0 && (
                <Text c="dimmed" ta="center" py="lg" size="sm">
                  No patients waiting.
                </Text>
              )}
              {open.map((v) => (
                <UnstyledButton key={v.id} onClick={() => setParams({ visit: v.id })} px="sm" py={8} style={{ borderTop: '1px solid var(--mantine-color-gray-2)', background: v.id === visitId ? 'var(--mantine-color-teal-0)' : undefined }}>
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <Text fw={700} w={26} ta="right">
                        {v.token}
                      </Text>
                      <div>
                        <Text size="sm" fw={500}>
                          {v.patient.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {v.doctorName} · in at {formatTime(v.checkedInAt)}
                        </Text>
                      </div>
                    </Group>
                    {v.hasVitals ? (
                      <Badge size="xs" color="teal" variant="light" style={{ flexShrink: 0 }}>
                        done
                      </Badge>
                    ) : (
                      <Badge size="xs" color="orange" variant="light" style={{ flexShrink: 0 }}>
                        needs vitals
                      </Badge>
                    )}
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          {selected ? (
            <VitalsForm
              key={selected.id}
              visit={selected}
              onSaved={() => {
                const next = nextWaiting(selected.id)
                setParams(next ? { visit: next.id } : {})
              }}
            />
          ) : (
            <Card withBorder radius="md" py="xl">
              <Text c="dimmed" ta="center">
                Pick a patient on the left.
              </Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

type Field = { key: keyof VitalsInput; label: string; unit: string; decimals?: number }
const FIELDS: Field[] = [
  { key: 'bpSys', label: 'BP systolic', unit: 'mmHg' },
  { key: 'bpDia', label: 'BP diastolic', unit: 'mmHg' },
  { key: 'pulse', label: 'Pulse', unit: '/min' },
  { key: 'tempF', label: 'Temperature', unit: '°F', decimals: 1 },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'rr', label: 'Respiratory rate', unit: '/min' },
  { key: 'weightKg', label: 'Weight', unit: 'kg', decimals: 1 },
  { key: 'heightCm', label: 'Height', unit: 'cm' },
  { key: 'painScore', label: 'Pain score', unit: '0–10' },
  { key: 'sugar', label: 'Blood sugar (random)', unit: 'mg/dL' },
]

function VitalsForm({ visit, onSaved }: { visit: VisitRow; onSaved: () => void }) {
  const { data: existing, isPending } = useVitals(visit.id)
  if (isPending) return null
  return <VitalsFormInner key={existing?.id ?? 'new'} visit={visit} existing={existing ?? null} onSaved={onSaved} />
}

function VitalsFormInner({ visit, existing, onSaved }: { visit: VisitRow; existing: Vitals | null; onSaved: () => void }) {
  const save = useSaveVitals()
  const canEdit = useCan(existing ? 'opd.vitals.edit' : 'opd.vitals.create')
  const [v, setV] = useState<Partial<VitalsInput>>(() => (existing ? { ...existing } : {}))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const age = yearsSince(visit.patient.dob, todayIST())
  const b = bmi(v.weightKg, v.heightCm)
  const flags = vitalFlags({ ...v, bmi: b }, age)
  const flagOf = (k: string) => flags.find((f) => f.field === k)

  const submit = () => {
    setErrors({})
    save.mutate(
      { visitId: visit.id, input: v as VitalsInput },
      {
        onSuccess: () => {
          notifySaved(`Vitals saved for token ${visit.token}. The doctor sees them now.`)
          onSaved()
        },
        onError: (e) => (isApiError(e) && e.fieldErrors ? setErrors(e.fieldErrors) : showApiError(e)),
      },
    )
  }
  useHotkeys([['mod+S', submit]], [])

  return (
    <Card withBorder radius="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        noValidate
      >
        <Stack>
          <Group justify="space-between">
            <PatientBadge patient={visit.patient} size="lg" />
            <Stack gap={2} align="flex-end">
              <Text size="sm">
                Token <b>{visit.token}</b> · {visit.doctorName}
              </Text>
              <VisitStatusBadge status={visit.status} />
            </Stack>
          </Group>
          <VisitFlow visit={visit} here="vitals" />
          {existing && (
            <Text size="xs" c="dimmed">
              Recorded by {existing.recordedByName} at {formatTime(existing.recordedAt)}
              {canEdit ? '. You can correct them.' : '.'}
            </Text>
          )}
          <Grid gap="sm">
            {FIELDS.map((f, i) => {
              const flag = flagOf(f.key)
              return (
                <Grid.Col key={f.key} span={{ base: 6, sm: 4, md: 3 }}>
                  <NumberInput
                    label={f.label}
                    suffix={` ${f.unit}`}
                    decimalScale={f.decimals ?? 0}
                    hideControls
                    data-autofocus={i === 0 || undefined}
                    autoFocus={i === 0}
                    value={v[f.key] as number | undefined ?? ''}
                    onChange={(x) => setV((s) => ({ ...s, [f.key]: x === '' ? undefined : Number(x) }))}
                    error={errors[f.key] ?? (flag ? flag.text : undefined)}
                    styles={flag && !errors[f.key] ? { input: { borderColor: 'var(--mantine-color-orange-5)', background: 'var(--mantine-color-orange-0)' }, error: { color: 'var(--mantine-color-orange-8)' } } : undefined}
                    readOnly={!canEdit}
                  />
                </Grid.Col>
              )
            })}
            <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
              <TextInput label="BMI" value={b ? String(b) : ''} readOnly description="Calculated" error={flagOf('bmi')?.text} />
            </Grid.Col>
          </Grid>
          <TextInput label="Notes" placeholder="e.g. Patient anxious, BP repeated after 5 minutes" value={v.notes ?? ''} onChange={(e) => setV((s) => ({ ...s, notes: e.currentTarget.value }))} readOnly={!canEdit} />
          {flags.length > 0 && (
            <Alert color="orange" icon={<IconAlertTriangle />} p="xs">
              Out of range: {[...new Set(flags.map((f) => f.text))].join(', ')}. The doctor will see these highlighted.
            </Alert>
          )}
          {age < 12 && (
            <Text size="xs" c="dimmed">
              Child: only SpO₂, temperature and sugar are checked against ranges.
            </Text>
          )}
          {canEdit && (
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Enter or Ctrl+S saves and opens the next patient
              </Text>
              <Button type="submit" size="md" loading={save.isPending}>
                Save vitals
              </Button>
            </Group>
          )}
        </Stack>
      </form>
    </Card>
  )
}
