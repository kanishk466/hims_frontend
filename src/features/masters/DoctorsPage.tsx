import { ActionIcon, Badge, Button, Card, Group, Menu, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconCalendarTime, IconDots, IconFileSpreadsheet, IconPencil, IconPlus, IconRestore, IconSearch, IconUserOff } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { ActiveFilter } from '@/components/ActiveFilter'
import { confirmDeactivate } from '@/components/confirmDeactivate'
import { ExcelImportModal } from '@/components/ExcelImportModal'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { matchImportOption, type ImportColumn } from '@/lib/excelImport'
import { matchesActive, matchesText, type ActiveFilterValue } from '@/lib/filters'
import { formatWeekdays, MEDICAL_COUNCILS } from '@/lib/india'
import { formatINR } from '@/lib/money'
import { DOCTOR_TYPE_LABELS, DOCTOR_TYPES, doctorInputSchema, type Department, type Doctor, type DoctorInput } from '@/types/masters'
import { useDepartments, useDoctors, useSaveDoctor, useSchedules, useSetDoctorActive } from './queries'

const DOCTOR_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'name', header: 'Name', example: 'Dr. Asha Rao' },
  { key: 'departmentCode', header: 'Department code', example: 'GM' },
  { key: 'qualification', header: 'Qualification', example: 'MBBS, MD (Medicine)' },
  { key: 'council', header: 'Medical council', example: MEDICAL_COUNCILS[0] ?? '' },
  { key: 'registrationNo', header: 'Registration no.', example: 'KMC-12345' },
  { key: 'feeNew', header: 'New-visit fee (₹)', example: '500' },
  { key: 'feeFollowUp', header: 'Follow-up fee (₹)', example: '300' },
  { key: 'type', header: 'Type (Full-time/Visiting)', example: 'Full-time' },
  { key: 'mobile', header: 'Mobile (optional)', example: '9876543210' },
]

/** Build a doctor create-input from one imported row's text, or an error for that row. */
function doctorRowToInput(values: Record<string, string>, departments: Department[]): { input: DoctorInput } | { error: string } {
  const departmentId = matchImportOption(
    values.departmentCode ?? '',
    departments.map((d) => ({ value: d.id, label: d.code ?? d.name })),
  )
  if (!departmentId) return { error: `Unknown department code "${values.departmentCode}"` }
  const type = matchImportOption(
    values.type ?? '',
    DOCTOR_TYPES.map((t) => ({ value: t, label: DOCTOR_TYPE_LABELS[t] })),
  )
  const candidate = {
    name: values.name ?? '',
    departmentId,
    qualification: values.qualification ?? '',
    council: values.council ?? '',
    registrationNo: values.registrationNo ?? '',
    feeNewPaise: Math.round(Number(values.feeNew ?? '0') * 100),
    feeFollowUpPaise: Math.round(Number(values.feeFollowUp ?? '0') * 100),
    type: type || 'fullTime',
    mobile: values.mobile ?? '',
  }
  const parsed = doctorInputSchema.safeParse(candidate)
  return parsed.success ? { input: parsed.data } : { error: parsed.error.issues[0]?.message ?? 'Invalid row' }
}

export function DoctorsPage() {
  const navigate = useNavigate()
  const { data: doctors } = useDoctors(true)
  const { data: departments } = useDepartments(true)
  const { data: schedules } = useSchedules()
  const setActive = useSetDoctorActive()
  const canEdit = useCan('masters.doctors.edit')
  const canCancel = useCan('masters.doctors.cancel')
  const [q, setQ] = useState('')
  const [dept, setDept] = useState<string | null>(null)
  const [filter, setFilter] = useState<ActiveFilterValue>('active')
  const [importOpen, setImportOpen] = useState(false)
  const saveDoctor = useSaveDoctor()

  const deptName = (id: string) => departments?.find((d) => d.id === id)?.name ?? '—'
  const rows = useMemo(
    () => (doctors ?? []).filter((d) => matchesActive(d.active, filter) && (!dept || d.departmentId === dept) && matchesText(q, d.name, d.registrationNo, d.qualification)),
    [doctors, filter, dept, q],
  )
  const activeCount = (doctors ?? []).filter((d) => d.active).length

  const toggle = (d: Doctor) => {
    const run = () => setActive.mutate({ id: d.id, active: !d.active }, { onSuccess: () => notifySaved(`${d.name} ${d.active ? 'deactivated' : 'reactivated'}.`), onError: (e) => showApiError(e) })
    if (d.active) confirmDeactivate(d.name, 'They will no longer appear for appointments, check-in or billing.', run)
    else run()
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Doctors"
        subtitle="Consultation fees here become versioned tariffs: a fee change applies from today and old bills keep their price."
        actions={
          <Can permission="masters.doctors.create">
            <Group gap="xs">
              <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} onClick={() => setImportOpen(true)}>
                Import from Excel
              </Button>
              <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/masters/doctors/new')}>
                Add doctor
              </Button>
            </Group>
          </Can>
        }
      />
      <Card withBorder radius="md" p={0}>
        <Group p="sm" justify="space-between">
          <Group gap="sm">
            <TextInput placeholder="Search name, registration no." leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} aria-label="Search doctors" autoFocus />
            <Select placeholder="All departments" data={(departments ?? []).filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))} value={dept} onChange={setDept} clearable w={220} aria-label="Filter by department" />
          </Group>
          <ActiveFilter value={filter} onChange={setFilter} counts={{ active: activeCount, inactive: (doctors?.length ?? 0) - activeCount }} />
        </Group>
        <Table.ScrollContainer minWidth={980}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Doctor</Table.Th>
                <Table.Th>Department</Table.Th>
                <Table.Th>Registration</Table.Th>
                <Table.Th ta="right">New</Table.Th>
                <Table.Th ta="right">Follow-up</Table.Th>
                <Table.Th>OPD timings</Table.Th>
                <Table.Th>Login</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" ta="center" py="lg">
                      No doctors match.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((d) => {
                const sessions = (schedules ?? []).filter((s) => s.doctorId === d.id)
                return (
                  <Table.Tr key={d.id} style={d.active ? undefined : { opacity: 0.6 }}>
                    <Table.Td>
                      <Group gap={6}>
                        <Text size="sm" fw={600}>
                          {d.name}
                        </Text>
                        {d.type === 'visiting' && (
                          <Badge size="xs" variant="light" color="gray">
                            {DOCTOR_TYPE_LABELS.visiting}
                          </Badge>
                        )}
                        {!d.active && (
                          <Badge size="xs" variant="light" color="gray">
                            Inactive
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {d.qualification}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{deptName(d.departmentId)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{d.registrationNo}</Text>
                    </Table.Td>
                    <Table.Td ta="right">{formatINR(d.feeNewPaise)}</Table.Td>
                    <Table.Td ta="right">{formatINR(d.feeFollowUpPaise)}</Table.Td>
                    <Table.Td>
                      {sessions.length ? (
                        sessions.map((s) => (
                          <Text key={s.id} size="xs">
                            {formatWeekdays(s.weekdays)} {s.start}–{s.end}
                          </Text>
                        ))
                      ) : (
                        <Text size="xs" c="orange.8">
                          None yet
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={d.userId ? undefined : 'dimmed'}>
                        {d.userId ? 'Linked' : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${d.name}`}>
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {canEdit && (
                            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/masters/doctors/${d.id}/edit`)}>
                              Edit details and fees
                            </Menu.Item>
                          )}
                          <Menu.Item leftSection={<IconCalendarTime size={16} />} component={Link} to={`/masters/schedules?doctor=${d.id}`}>
                            OPD timings and leave
                          </Menu.Item>
                          {d.active && canCancel && (
                            <Menu.Item leftSection={<IconUserOff size={16} />} color="red" onClick={() => toggle(d)}>
                              Deactivate
                            </Menu.Item>
                          )}
                          {!d.active && canEdit && (
                            <Menu.Item leftSection={<IconRestore size={16} />} onClick={() => toggle(d)}>
                              Reactivate
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
      <ExcelImportModal<DoctorInput>
        opened={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import doctors from Excel"
        templateFilename="doctors-template.xlsx"
        columns={DOCTOR_IMPORT_COLUMNS}
        toInput={(values) => doctorRowToInput(values, departments ?? [])}
        importRow={(input) => saveDoctor.mutateAsync({ input })}
      />
    </Stack>
  )
}
