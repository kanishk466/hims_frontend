import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, Select, SimpleGrid, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { IconArrowBackUp, IconArrowsExchange, IconDeviceTv, IconDots, IconPlayerSkipForward, IconSpeakerphone, IconUserOff, IconX } from '@tabler/icons-react'
import { useMemo, useState } from 'react'

import { useSession } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import type { VisitRow } from '@/types/opd'
import { useDoctors } from '../masters/queries'
import { useCallNext, useCallVisit, useCancelVisit, useNoShow, useRecallVisit, useSkipVisit, useTransferVisit, useVisits } from './queries'
import { MlcBadge } from './MlcBadge'
import { VisitStatusBadge } from './VisitStatusBadge'

const OPEN = ['checkedIn', 'billed', 'vitalsDone', 'inConsultation']

/** Live queue per doctor (OPD-04): call, skip, recall, move to another doctor, no-show. */
export function QueuePage() {
  const { data: session } = useSession()
  const myDoctor = session?.user.doctorId ?? null
  const [doctorId, setDoctorId] = useState<string | null>(myDoctor)
  const { data: visits } = useVisits({ doctorId: doctorId ?? undefined }, 5000)
  const { data: doctors } = useDoctors()
  const canTv = useCan('opd.tvDisplay.view')

  const byDoctor = useMemo(() => {
    const m = new Map<string, VisitRow[]>()
    for (const v of visits ?? []) m.set(v.doctorId, [...(m.get(v.doctorId) ?? []), v])
    return [...m.entries()].sort((a, b) => a[1][0]!.doctorName.localeCompare(b[1][0]!.doctorName))
  }, [visits])

  return (
    <Stack gap="lg">
      <PageHeader
        title="Queue"
        subtitle="Today’s tokens per doctor. Updates every few seconds and across open tabs."
        actions={
          <Group gap="xs">
            <Select placeholder="All doctors" data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={setDoctorId} clearable searchable w={220} aria-label="Filter by doctor" />
            {canTv && (
              <Button variant="default" leftSection={<IconDeviceTv size={16} />} component="a" href="/tv" target="_blank">
                Open TV display
              </Button>
            )}
          </Group>
        }
      />
      {byDoctor.length === 0 && (
        <Card withBorder radius="md" py="xl">
          <Text c="dimmed" ta="center">
            No patients checked in yet today.
          </Text>
        </Card>
      )}
      <SimpleGrid cols={{ base: 1, lg: doctorId ? 1 : 2 }} spacing="md">
        {byDoctor.map(([id, rows]) => (
          <DoctorQueue key={id} doctorId={id} rows={rows} />
        ))}
      </SimpleGrid>
    </Stack>
  )
}

function DoctorQueue({ doctorId, rows }: { doctorId: string; rows: VisitRow[] }) {
  const canEdit = useCan('opd.queue.edit')
  const callNext = useCallNext()
  const inside = rows.find((v) => v.status === 'inConsultation')
  const waiting = rows.filter((v) => OPEN.includes(v.status) && v.status !== 'inConsultation')
  const done = rows.filter((v) => !OPEN.includes(v.status))
  const first = rows[0]!

  return (
    <Card withBorder radius="md" padding="sm">
      <Group justify="space-between" mb="xs">
        <div>
          <Text fw={700}>{first.doctorName}</Text>
          <Text size="xs" c="dimmed">
            {first.departmentName}
            {first.room ? ` · ${first.room}` : ''} · {waiting.length} waiting · {done.filter((d) => d.status === 'completed').length} done
          </Text>
        </div>
        {canEdit && (
          <Button
            size="xs"
            leftSection={<IconSpeakerphone size={14} />}
            onClick={() => callNext.mutate(doctorId, { onSuccess: (v) => notifySaved(v ? `Token ${v.token} called` : 'Nobody is waiting.'), onError: (e) => showApiError(e) })}
            loading={callNext.isPending}
            disabled={!!inside}
          >
            Call next
          </Button>
        )}
      </Group>
      <Group gap="sm" mb="xs" p="xs" bg={inside ? 'orange.0' : 'gray.0'} style={{ borderRadius: 8 }}>
        <Text size="sm" c="dimmed" w={110}>
          In the room
        </Text>
        {inside ? (
          <>
            <Title order={3}>{inside.token}</Title>
            <Text size="sm">{inside.patient.name}</Text>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            —
          </Text>
        )}
      </Group>
      <Stack gap={4}>
        {waiting.map((v) => (
          <QueueRow key={v.id} v={v} />
        ))}
        {waiting.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="xs">
            No one waiting.
          </Text>
        )}
      </Stack>
      {done.length > 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          Closed today: {done.map((d) => `${d.token}${d.status === 'completed' ? '' : ` (${d.status === 'noShow' ? 'no-show' : 'cancelled'})`}`).join(', ')}
        </Text>
      )}
    </Card>
  )
}

function QueueRow({ v }: { v: VisitRow }) {
  const canEdit = useCan('opd.queue.edit')
  const canCancel = useCan('opd.checkin.cancel')
  const call = useCallVisit()
  const skip = useSkipVisit()
  const recall = useRecallVisit()
  const noShow = useNoShow()
  const [dialog, setDialog] = useState<'transfer' | 'cancel' | null>(null)
  const ok = (m: string) => ({ onSuccess: () => notifySaved(m), onError: (e: unknown) => showApiError(e) })

  return (
    <Group justify="space-between" wrap="nowrap" py={4} px="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
      <Group gap="sm" wrap="nowrap">
        <Text fw={700} w={30} ta="right" c={v.emergency ? 'red.7' : undefined}>
          {v.token}
        </Text>
        <div>
          <Group gap={6}>
            <Text size="sm" fw={500}>
              {v.patient.name}
            </Text>
            <MlcBadge mlc={v.mlc} size="xs" />
            {v.emergency ? (
              <Badge size="xs" color="red" variant="light">
                emergency
              </Badge>
            ) : (
              v.priority && (
                <Badge size="xs" color="blue">
                  appointment
                </Badge>
              )
            )}
            {v.payerId !== 'cash' && (
              <Badge size="xs" variant="outline" color="grape">
                {v.payerName}
              </Badge>
            )}
          </Group>
          <Group gap={6}>
            <VisitStatusBadge status={v.status} />
            {!v.consultPaid && !v.waiveConsultation && (
              <Badge size="xs" color="red" variant="light">
                not paid
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              waiting {v.waitingMinutes} min
            </Text>
          </Group>
        </div>
      </Group>
      {(canEdit || canCancel) && (
        <Group gap={4} wrap="nowrap">
          {canEdit && (
            <Tooltip label="Call into the room">
              <ActionIcon variant="light" onClick={() => call.mutate(v.id, ok(`Token ${v.token} called`))} aria-label={`Call token ${v.token}`}>
                <IconSpeakerphone size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={`More for token ${v.token}`}>
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {canEdit && (
                <>
                  <Menu.Item leftSection={<IconPlayerSkipForward size={16} />} onClick={() => skip.mutate(v.id, ok(`Token ${v.token} moved to the end`))}>
                    Skip (patient not here)
                  </Menu.Item>
                  <Menu.Item leftSection={<IconArrowBackUp size={16} />} onClick={() => recall.mutate(v.id, ok(`Token ${v.token} is next`))}>
                    Recall to the front
                  </Menu.Item>
                  <Menu.Item leftSection={<IconArrowsExchange size={16} />} onClick={() => setDialog('transfer')}>
                    Move to another doctor
                  </Menu.Item>
                  <Menu.Item leftSection={<IconUserOff size={16} />} onClick={() => noShow.mutate(v.id, ok(`Token ${v.token} marked no-show`))}>
                    Mark no-show
                  </Menu.Item>
                </>
              )}
              {canCancel && (
                <Menu.Item leftSection={<IconX size={16} />} color="red" onClick={() => setDialog('cancel')}>
                  Cancel visit
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}
      {dialog && <QueueDialog kind={dialog} visit={v} onClose={() => setDialog(null)} />}
    </Group>
  )
}

function QueueDialog({ kind, visit, onClose }: { kind: 'transfer' | 'cancel'; visit: VisitRow; onClose: () => void }) {
  const { data: doctors } = useDoctors()
  const transfer = useTransferVisit()
  const cancel = useCancelVisit()
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const submit = () => {
    if (kind === 'transfer' && doctorId)
      transfer.mutate({ id: visit.id, doctorId, reason }, { onSuccess: (v) => { notifySaved(`Moved to ${v.doctorName}, token ${v.token}`); onClose() }, onError: (e) => showApiError(e) })
    if (kind === 'cancel') cancel.mutate({ id: visit.id, reason }, { onSuccess: () => { notifySaved('Visit cancelled.'); onClose() }, onError: (e) => showApiError(e) })
  }
  return (
    <Modal opened onClose={onClose} title={kind === 'transfer' ? `Move token ${visit.token} to another doctor` : `Cancel visit of ${visit.patient.name}`}>
      <Stack>
        {kind === 'transfer' && (
          <Select label="New doctor" data={(doctors ?? []).filter((d) => d.id !== visit.doctorId).map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={setDoctorId} searchable data-autofocus />
        )}
        <TextInput label="Reason" withAsterisk value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder={kind === 'transfer' ? 'e.g. Needs ENT opinion' : 'e.g. Patient left'} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Back
          </Button>
          <Button color={kind === 'cancel' ? 'red' : undefined} onClick={submit} disabled={!reason.trim() || (kind === 'transfer' && !doctorId)} loading={transfer.isPending || cancel.isPending}>
            {kind === 'transfer' ? 'Move' : 'Cancel visit'}
          </Button>
        </Group>
        {kind === 'transfer' && (
          <Text size="xs" c="dimmed">
            The patient gets a new token for the new doctor. Payment stays with the visit.
          </Text>
        )}
      </Stack>
    </Modal>
  )
}

