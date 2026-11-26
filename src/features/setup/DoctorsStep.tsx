import { ActionIcon, Badge, Button, Card, Group, Loader, Menu, Stack, Table, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconDots, IconPencil, IconPlus, IconUserOff } from '@tabler/icons-react'
import { useState } from 'react'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatINR } from '@/lib/money'
import { DOCTOR_TYPE_LABELS, type Doctor } from '@/types/masters'
import { DoctorFormModal } from '../masters/DoctorFormModal'
import { useDepartments, useDoctors, useSetDoctorActive } from '../masters/queries'
import { StepFooter } from './StepFooter'

/** Wizard step 3. */
export function DoctorsStep({ onNext }: { onNext: () => void }) {
  const { data: doctors } = useDoctors()
  const { data: departments } = useDepartments()
  const deactivate = useSetDoctorActive()
  const canEdit = useCan('masters.doctors.edit')
  const canCancel = useCan('masters.doctors.cancel')
  const [modal, setModal] = useState<{ open: boolean; doctor: Doctor | null }>({ open: false, doctor: null })

  if (!doctors || !departments) return <Loader />
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—'

  const confirmDeactivate = (d: Doctor) =>
    modals.openConfirmModal({
      title: `Deactivate ${d.name}?`,
      children: <Text size="sm">They will no longer appear for appointments or billing. Past visits stay. You can reactivate them in Masters → Doctors.</Text>,
      labels: { confirm: 'Deactivate', cancel: 'Keep' },
      confirmProps: { color: 'red' },
      onConfirm: () => deactivate.mutate({ id: d.id, active: false }, { onSuccess: () => notifySaved(`${d.name} deactivated.`), onError: (e) => showApiError(e) }),
    })

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={3} fz="h4">
            Doctors
          </Title>
          <Text c="dimmed" size="sm">
            Add every doctor who sees OPD patients, with their consultation fees.
          </Text>
        </div>
        <Can permission="masters.doctors.create">
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true, doctor: null })} autoFocus={doctors.length === 0}>
            Add doctor
          </Button>
        </Can>
      </Group>

      {doctors.length === 0 ? (
        <Card withBorder radius="md" py="xl">
          <Text ta="center" c="dimmed">
            No doctors yet. Click “Add doctor”. Use “Save and add another” to enter several quickly.
          </Text>
        </Card>
      ) : (
        <Card withBorder radius="md" p={0}>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Doctor</Table.Th>
                  <Table.Th>Department</Table.Th>
                  <Table.Th>Registration</Table.Th>
                  <Table.Th ta="right">New visit</Table.Th>
                  <Table.Th ta="right">Follow-up</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {doctors.map((d) => (
                  <Table.Tr key={d.id}>
                    <Table.Td>
                      <Group gap={6}>
                        <Text fw={600} size="sm">
                          {d.name}
                        </Text>
                        {d.type === 'visiting' && (
                          <Badge size="xs" variant="light" color="gray">
                            {DOCTOR_TYPE_LABELS.visiting}
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
                      <Text size="xs" c="dimmed">
                        {d.council}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">{formatINR(d.feeNewPaise)}</Table.Td>
                    <Table.Td ta="right">{formatINR(d.feeFollowUpPaise)}</Table.Td>
                    <Table.Td>
                      {(canEdit || canCancel) && (
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${d.name}`}>
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {canEdit && (
                              <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setModal({ open: true, doctor: d })}>
                                Edit
                              </Menu.Item>
                            )}
                            {canCancel && (
                              <Menu.Item leftSection={<IconUserOff size={16} />} color="red" onClick={() => confirmDeactivate(d)}>
                                Deactivate
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <StepFooter
        canEdit
        submit={false}
        onContinue={onNext}
        continueDisabled={doctors.length === 0}
        hint={doctors.length === 0 ? 'Add at least one doctor to continue.' : `${doctors.length} doctor${doctors.length > 1 ? 's' : ''} added.`}
      />
      <DoctorFormModal opened={modal.open} doctor={modal.doctor} onClose={() => setModal({ open: false, doctor: null })} />
    </Stack>
  )
}
