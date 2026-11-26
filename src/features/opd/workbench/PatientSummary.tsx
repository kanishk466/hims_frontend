import { Alert, Badge, Card, Divider, Group, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { Consultation } from '@/api/emr'
import { formatDay, formatTime } from '@/lib/dates'
import { vitalFlags } from '@/lib/opd/vitals'
import { useValueList } from '../../masters/queries'
import { patientAgeSex, yearsSince } from '../format'

const VITAL_LINES: {
  key: 'bpSys' | 'pulse' | 'tempF' | 'spo2' | 'rr' | 'weightKg' | 'sugar' | 'painScore'
  label: string
  unit: string
}[] = [
  { key: 'pulse', label: 'Pulse', unit: '/min' },
  { key: 'tempF', label: 'Temp', unit: '°F' },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'rr', label: 'Resp. rate', unit: '/min' },
  { key: 'weightKg', label: 'Weight', unit: 'kg' },
  { key: 'sugar', label: 'Sugar', unit: 'mg/dl' },
  { key: 'painScore', label: 'Pain', unit: '/10' },
]

/** Left column of the consultation: who the patient is, what to watch for, what happened before. */
export function PatientSummary({ c }: { c: Consultation }) {
  const { patient, vitals, pastVisits } = c
  const { data: allergyList } = useValueList('allergy')
  const allergyName = (code: string) => allergyList?.find((a) => a.code === code)?.label ?? code
  const flags = vitals ? vitalFlags(vitals, yearsSince(patient.dob, c.visit.date)) : []
  const flagged = new Set(flags.map((f) => f.field))
  return (
    <Stack gap="md">
      <Card withBorder radius="md">
        <Text fw={700} size="lg">
          {patient.name}
        </Text>
        <Text size="sm" c="dimmed">
          {patientAgeSex(patient)} · {patient.uhid}
        </Text>
        <Text size="sm" c="dimmed">
          {c.visit.visitTypeLabel} · {c.visit.payerName}
        </Text>
        {patient.allergies.length > 0 ? (
          <Alert color="red" variant="light" mt="sm" p="xs" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm" fw={600}>
              Allergic to {patient.allergies.map(allergyName).join(', ')}
            </Text>
          </Alert>
        ) : (
          <Text size="xs" c="dimmed" mt="sm">
            No known allergies
          </Text>
        )}
        {patient.chronicConditions.length > 0 && (
          <Group gap={4} mt="sm">
            {patient.chronicConditions.map((x) => (
              <Badge key={x} size="sm" variant="light" color="grape">
                {x}
              </Badge>
            ))}
          </Group>
        )}
      </Card>
      <Card withBorder radius="md">
        <Group justify="space-between">
          <Text fw={600}>Vitals</Text>
          {vitals && (
            <Text size="xs" c="dimmed">
              {formatTime(vitals.recordedAt)}
            </Text>
          )}
        </Group>
        {!vitals ? (
          <Text size="sm" c="dimmed" mt={4}>
            Not recorded.
          </Text>
        ) : (
          <Stack gap={2} mt={6}>
            {vitals.bpSys !== undefined && <Line label="BP" value={`${vitals.bpSys}/${vitals.bpDia ?? '–'} mmHg`} bad={flagged.has('bpSys') || flagged.has('bpDia')} />}
            {VITAL_LINES.filter((l) => vitals[l.key] !== undefined).map((l) => (
              <Line key={l.key} label={l.label} value={`${vitals[l.key]} ${l.unit}`} bad={flagged.has(l.key)} />
            ))}
            {vitals.bmi !== undefined && <Line label="BMI" value={String(vitals.bmi)} bad={flagged.has('bmi')} />}
            {flags.length > 0 && (
              <Text size="xs" c="red" mt={4}>
                {[...new Set(flags.map((f) => f.text))].join(' · ')}
              </Text>
            )}
          </Stack>
        )}
      </Card>
      <Card withBorder radius="md">
        <Text fw={600}>Past visits</Text>
        {pastVisits.length === 0 && (
          <Text size="sm" c="dimmed" mt={4}>
            First visit.
          </Text>
        )}
        <Stack gap={6} mt={6}>
          {pastVisits.map((p, i) => (
            <div key={p.visitId}>
              {i > 0 && <Divider mb={6} />}
              <Text size="sm" fw={500}>
                {formatDay(p.date)} · {p.doctorName}
              </Text>
              {p.diagnoses.length > 0 && <Text size="xs">{p.diagnoses.join('; ')}</Text>}
              {p.drugs.length > 0 && (
                <Text size="xs" c="dimmed">
                  Rx: {p.drugs.join(', ')}
                </Text>
              )}
              {p.vitals && (
                <Text size="xs" c="dimmed">
                  {p.vitals}
                </Text>
              )}
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  )
}

function Line({ label, value, bad }: { label: string; value: string; bad: boolean }) {
  return (
    <Group justify="space-between" gap="xs">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={bad ? 700 : 500} c={bad ? 'red' : undefined}>
        {value}
      </Text>
    </Group>
  )
}
