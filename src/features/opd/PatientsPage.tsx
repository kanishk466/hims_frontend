import { Button, Card, Stack, Table, Text } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconUserPlus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { PageHeader } from '@/components/PageHeader'
import { formatDay } from '@/lib/dates'
import type { Patient } from '@/types/opd'
import { EmergencyButton } from './EmergencyButton'
import { patientAgeSex } from './format'
import { PatientPicker } from './PatientPicker'
import { usePatientSearch } from './queries'
import { RegisteredModal } from './RegisteredModal'

/** OPD Spec screens 1–2: find a patient, or register a new one. */
export function PatientsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [registered, setRegistered] = useState<Patient | null>(() => (location.state as { registered?: Patient } | null)?.registered ?? null)
  const { data: recent } = usePatientSearch('')
  // F2 opens registration from anywhere on the page.
  useHotkeys([['F2', () => navigate('/opd/patients/new')]], [])

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
    // Only on mount: this consumes router state exactly once, not whenever it's re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Stack gap="lg">
      <PageHeader
        title="Patients"
        subtitle="Search first to avoid duplicates. Registration needs only name, gender, age and mobile."
        actions={
          <>
            <EmergencyButton />
            <Can permission="opd.registration.create">
              <Button leftSection={<IconUserPlus size={16} />} onClick={() => navigate('/opd/patients/new')}>
                Register new patient (F2)
              </Button>
            </Can>
          </>
        }
      />
      <Card withBorder radius="md">
        <PatientPicker autoFocus onPick={(p) => navigate(`/opd/patients/${p.id}`)} onRegister={(prefill) => navigate(`/opd/patients/new?prefill=${encodeURIComponent(prefill)}`)} />
      </Card>
      <Card withBorder radius="md" p={0}>
        <Text fw={600} p="sm">
          Recent patients
        </Text>
        <Table highlightOnHover verticalSpacing={8}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>UHID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Age / sex</Table.Th>
              <Table.Th>Mobile</Table.Th>
              <Table.Th>Last visit</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(recent ?? []).slice(0, 12).map((p) => (
              <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/opd/patients/${p.id}`)}>
                <Table.Td>
                  <Text size="sm" ff="monospace">
                    {p.uhid}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {p.name}
                  </Text>
                </Table.Td>
                <Table.Td>{patientAgeSex(p)}</Table.Td>
                <Table.Td>{p.mobile}</Table.Td>
                <Table.Td>{p.lastVisitDate ? formatDay(p.lastVisitDate) : '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <RegisteredModal patient={registered} onClose={() => setRegistered(null)} />
    </Stack>
  )
}
