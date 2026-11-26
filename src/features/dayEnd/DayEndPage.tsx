import { Alert, Badge, Button, Card, Grid, Group, Modal, NumberInput, Stack, Table, Tabs, Text, Textarea, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconCheck, IconLock, IconLockOpen, IconPrinter, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { MoneyInput } from '@/components/MoneyInput'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { addDays, formatDateTime, formatDay, formatTime, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { DENOMINATIONS, type CashClosing, type DayEndView, type MyCounter } from '@/types/dayEnd'
import { useCloseDay, useDayEnd, useDecideClosing, useMyCounter, useReopenDay, useSubmitClosing } from './queries'

const STATUS_COLOR = { submitted: 'yellow', accepted: 'teal', rejected: 'red' } as const
const STATUS_LABEL = { submitted: 'Waiting for Accounts', accepted: 'Accepted', rejected: 'Sent back' } as const

/** OPD Spec screen 13: count and hand over (cashier), accept and close the day (Accounts). */
export function DayEndPage() {
  const isCashier = useCan('opd.dayEnd.create')
  const isAccounts = useCan('opd.dayEnd.approve')
  const [tab, setTab] = useState<string | null>(isCashier ? 'counter' : 'day')
  return (
    <Stack gap="lg">
      <PageHeader title="Day-end" subtitle="Cashiers count the drawer and hand over; Accounts accepts each handover and closes the day." />
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          {isCashier && <Tabs.Tab value="counter">My counter</Tabs.Tab>}
          {isAccounts && <Tabs.Tab value="day">Day-end (all cashiers)</Tabs.Tab>}
        </Tabs.List>
        {isCashier && (
          <Tabs.Panel value="counter" pt="md">
            <MyCounterPanel />
          </Tabs.Panel>
        )}
        {isAccounts && (
          <Tabs.Panel value="day" pt="md">
            <DayPanel />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  )
}

/* ---------- Cashier ---------- */

function MyCounterPanel() {
  const { data: mine } = useMyCounter(true)
  if (!mine) return null
  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, md: 7 }}>{mine.receiptsCount === 0 ? <NothingToHandOver mine={mine} /> : <CountForm key={`${mine.receiptsCount}-${mine.cashSystemPaise}`} mine={mine} />}</Grid.Col>
      <Grid.Col span={{ base: 12, md: 5 }}>
        <Card withBorder radius="md" p={0}>
          <Text fw={600} p="sm">
            My handovers
          </Text>
          <Table verticalSpacing={6}>
            <Table.Tbody>
              {mine.closings.length === 0 && (
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed" ta="center" py="xs">
                      None yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {mine.closings.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Text size="sm">
                      {formatDay(c.date)} · {formatTime(c.submittedAt)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Cash {formatINR(c.cashCountedPaise)}
                      {c.cashVariancePaise ? ` (${c.cashVariancePaise < 0 ? 'short' : 'over'} ${formatINR(Math.abs(c.cashVariancePaise))})` : ''}
                    </Text>
                    {c.rejectNote && (
                      <Text size="xs" c="red">
                        Sent back: {c.rejectNote}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Group gap={6} justify="flex-end" wrap="nowrap">
                      <Badge size="sm" variant="light" color={STATUS_COLOR[c.status]}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                      <Button size="compact-xs" variant="subtle" component={Link} to={`/print/handover/${c.id}`} target="_blank" aria-label="Print handover slip">
                        <IconPrinter size={14} />
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Grid.Col>
    </Grid>
  )
}

function NothingToHandOver({ mine }: { mine: MyCounter }) {
  return (
    <Alert color="teal" variant="light" icon={<IconCheck />}>
      <Text fw={600}>Nothing to hand over.</Text>
      <Text size="sm">
        {mine.closings[0]?.status === 'submitted' ? 'Your last handover is waiting for Accounts to accept it.' : 'Every receipt you took is in a handover.'}
        {mine.todayClosed ? ` Today was closed by ${mine.todayClosed.closedByName}.` : ''}
      </Text>
    </Alert>
  )
}

function CountForm({ mine }: { mine: MyCounter }) {
  const submit = useSubmitClosing()
  const [notes, setNotes] = useState<Record<string, number>>({})
  const [coins, setCoins] = useState(0)
  const nonCashModes = mine.byMode.filter((m) => m.mode !== 'cash')
  const [confirmed, setConfirmed] = useState<Record<string, number>>(Object.fromEntries(nonCashModes.map((m) => [m.mode, m.systemPaise])))
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const counted = DENOMINATIONS.reduce((s, d) => s + d * 100 * (notes[d] ?? 0), 0) + coins
  const variance = counted - mine.cashSystemPaise
  const nonCashOff = nonCashModes.some((m) => (confirmed[m.mode] ?? m.systemPaise) !== m.systemPaise)
  const needsReason = Math.abs(variance) > mine.tolerancePaise || nonCashOff

  const send = () =>
    submit.mutate(
      { notes: Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, v || 0])), coinsPaise: coins, nonCash: nonCashModes.map((m) => ({ mode: m.mode, confirmedPaise: confirmed[m.mode] ?? m.systemPaise })), reason: reason.trim() || undefined },
      {
        onSuccess: (c) => {
          notifySaved(`Handed over ${formatINR(c.cashCountedPaise)} cash. Accounts will accept it.`)
          window.open(`/print/handover/${c.id}`, '_blank')
        },
        onError: (e) => {
          if (e && typeof e === 'object' && 'code' in e && e.code === 'reason') setReasonError('Explain the difference')
          showApiError(e)
        },
      },
    )

  return (
    <Card withBorder radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Count your cash</Title>
          <Text size="sm" c="dimmed">
            {mine.receiptsCount} receipts since {mine.from ? formatDateTime(mine.from) : '—'}
            {mine.refundsPaise ? ` · refunds ${formatINR(mine.refundsPaise)}` : ''}
          </Text>
        </div>
        <Table withRowBorders={false} verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Note</Table.Th>
              <Table.Th w={110}>Count</Table.Th>
              <Table.Th ta="right">Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {DENOMINATIONS.map((d, i) => (
              <Table.Tr key={d}>
                <Table.Td>₹{d}</Table.Td>
                <Table.Td>
                  <NumberInput size="xs" min={0} hideControls allowDecimal={false} allowNegative={false} aria-label={`Number of ₹${d} notes`} value={notes[d] ?? ''} onChange={(v) => setNotes((n) => ({ ...n, [d]: Number(v) || 0 }))} autoFocus={i === 0} />
                </Table.Td>
                <Table.Td ta="right">{formatINR(d * 100 * (notes[d] ?? 0))}</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td>Coins and small notes</Table.Td>
              <Table.Td colSpan={2}>
                <MoneyInput size="xs" aria-label="Coins and small notes" value={coins || undefined} onChange={(v) => setCoins(v ?? 0)} />
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        <Grid>
          <Grid.Col span={4}>
            <Stat label="System cash" value={formatINR(mine.cashSystemPaise)} />
          </Grid.Col>
          <Grid.Col span={4}>
            <Stat label="You counted" value={formatINR(counted)} />
          </Grid.Col>
          <Grid.Col span={4}>
            <Stat
              label={variance === 0 ? 'Matches' : variance < 0 ? 'Short' : 'Over'}
              value={formatINR(Math.abs(variance))}
              color={variance === 0 ? 'teal' : Math.abs(variance) > mine.tolerancePaise ? 'red' : 'orange'}
            />
          </Grid.Col>
        </Grid>
        {nonCashModes.length > 0 && (
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Check against the bank app / card terminal slip
            </Text>
            {nonCashModes.map((m) => (
              <Group key={m.mode} justify="space-between" wrap="nowrap">
                <Text size="sm">
                  {m.label}{' '}
                  <Text span size="xs" c="dimmed">
                    ({m.count} · system {formatINR(m.systemPaise)})
                  </Text>
                </Text>
                <MoneyInput size="xs" w={140} aria-label={`${m.label} as per slip`} value={confirmed[m.mode]} onChange={(v) => setConfirmed((c) => ({ ...c, [m.mode]: v ?? 0 }))} />
              </Group>
            ))}
          </Stack>
        )}
        {needsReason && (
          <Textarea
            label="Reason for the difference"
            withAsterisk
            description={`Needed when cash is off by more than ${formatINR(mine.tolerancePaise)}, or a slip does not match`}
            value={reason}
            onChange={(e) => {
              setReason(e.currentTarget.value)
              setReasonError(undefined)
            }}
            error={reasonError}
            autosize
            minRows={2}
          />
        )}
        <Button size="md" onClick={send} loading={submit.isPending} disabled={counted === 0 && mine.cashSystemPaise > 0}>
          Hand over {formatINR(counted)} to Accounts
        </Button>
      </Stack>
    </Card>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card withBorder radius="sm" p="xs" bg={color ? `${color}.0` : undefined}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} c={color ? `${color}.8` : undefined}>
        {value}
      </Text>
    </Card>
  )
}

/* ---------- Accounts ---------- */

function DayPanel() {
  const today = todayIST()
  const [date, setDate] = useState(today)
  const { data: view } = useDayEnd(date, true)
  const canApprove = useCan('opd.dayEnd.approve')
  const decide = useDecideClosing()
  const close = useCloseDay()
  const [reject, setReject] = useState<CashClosing | null>(null)
  const [reopen, setReopen] = useState(false)

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group>
          <DatePickerInput aria-label="Date" value={date} onChange={(d) => d && setDate(typeof d === 'string' ? d.slice(0, 10) : today)} maxDate={today} valueFormat="ddd, DD MMM YYYY" w={200} />
          <Button size="compact-sm" variant="subtle" onClick={() => setDate(addDays(date, -1))}>
            ← Previous day
          </Button>
          {date !== today && (
            <Button size="compact-sm" variant="subtle" onClick={() => setDate(today)}>
              Today
            </Button>
          )}
        </Group>
        <Group>
          <Can permission="opd.dayEnd.print">
            <Button variant="default" leftSection={<IconPrinter size={16} />} component={Link} to={`/print/day-end/${date}`} target="_blank">
              Print day-end report
            </Button>
          </Can>
          {view?.closed && canApprove && (
            <Button variant="light" color="orange" leftSection={<IconLockOpen size={16} />} onClick={() => setReopen(true)}>
              Reopen day
            </Button>
          )}
          {view && !view.closed && canApprove && (
            <Button
              leftSection={<IconLock size={16} />}
              disabled={view.blockers.length > 0}
              loading={close.isPending}
              onClick={() => close.mutate(date, { onSuccess: () => notifySaved(`${formatDay(date)} is closed.`), onError: (e) => showApiError(e) })}
            >
              Close the day
            </Button>
          )}
        </Group>
      </Group>
      {view?.closed && (
        <Alert color="teal" icon={<IconLock />} variant="light">
          Closed by {view.closed.closedByName} at {formatDateTime(view.closed.closedAt)}. No new payments on this date; its bills can be cancelled only by Accounts.
        </Alert>
      )}
      {view && !view.closed && view.blockers.length > 0 && (
        <Alert color="yellow" variant="light" title="Before the day can be closed">
          <Stack gap={2}>
            {view.blockers.map((b) => (
              <Text key={b} size="sm">
                • {b}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      {view && <Totals view={view} />}
      <Card withBorder radius="md" p={0}>
        <Text fw={600} p="sm">
          Cashiers
        </Text>
        <Table verticalSpacing={8}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Cashier</Table.Th>
              <Table.Th>Handover</Table.Th>
              <Table.Th ta="right">Cash counted</Table.Th>
              <Table.Th ta="right">Difference</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {view?.cashiers.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" size="sm" ta="center" py="xs">
                    No payments on this date.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {view?.cashiers.flatMap((c) => [
              ...c.closings.map((k) => (
                <Table.Tr key={k.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {c.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {formatTime(k.submittedAt)} · {k.receiptIds.length} receipts
                    </Text>
                    <Text size="xs" c="dimmed">
                      {k.byMode.map((m) => `${m.label} ${formatINR(m.systemPaise)}`).join(' · ')}
                    </Text>
                    {k.reason && (
                      <Text size="xs" c="orange.8">
                        “{k.reason}”
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{formatINR(k.cashCountedPaise)}</Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c={k.cashVariancePaise === 0 ? 'teal' : k.cashVariancePaise < 0 ? 'red' : 'orange'}>
                      {k.cashVariancePaise === 0 ? 'nil' : `${k.cashVariancePaise < 0 ? '−' : '+'}${formatINR(Math.abs(k.cashVariancePaise))}`}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    {k.status === 'submitted' && canApprove ? (
                      <Group gap={6} justify="flex-end" wrap="nowrap">
                        <Button size="compact-sm" color="teal" leftSection={<IconCheck size={14} />} onClick={() => decide.mutate({ id: k.id, accept: true }, { onSuccess: () => notifySaved(`Accepted ${c.name}'s handover.`), onError: (e) => showApiError(e) })}>
                          Accept
                        </Button>
                        <Button size="compact-sm" variant="default" leftSection={<IconX size={14} />} onClick={() => setReject(k)}>
                          Send back
                        </Button>
                      </Group>
                    ) : (
                      <Badge variant="light" color={STATUS_COLOR[k.status]}>
                        {STATUS_LABEL[k.status]}
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              )),
              ...(c.openCount
                ? [
                    <Table.Tr key={`${c.userId}-open`} bg="yellow.0">
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {c.name}
                        </Text>
                      </Table.Td>
                      <Table.Td colSpan={3}>
                        <Text size="sm">
                          {c.openCount} receipts ({formatINR(c.openPaise)}) not handed over yet
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Badge color="yellow" variant="light">
                          Counter open
                        </Badge>
                      </Table.Td>
                    </Table.Tr>,
                  ]
                : []),
            ])}
          </Table.Tbody>
        </Table>
      </Card>
      {reject && <RejectModal closing={reject} onClose={() => setReject(null)} />}
      {reopen && <ReopenModal date={date} onClose={() => setReopen(false)} />}
    </Stack>
  )
}

function Totals({ view }: { view: DayEndView }) {
  const collected = view.byMode.reduce((s, m) => s + m.systemPaise, 0)
  return (
    <Grid>
      <Grid.Col span={{ base: 6, md: 3 }}>
        <Stat label="Collected (net of refunds)" value={formatINR(collected)} />
      </Grid.Col>
      {view.byMode.slice(0, 3).map((m) => (
        <Grid.Col key={m.mode} span={{ base: 6, md: 3 }}>
          <Stat label={`${m.label} (${m.count})`} value={formatINR(m.systemPaise)} />
        </Grid.Col>
      ))}
      <Grid.Col span={{ base: 6, md: 3 }}>
        <Stat label={`Bills (${view.bills.count})`} value={formatINR(view.bills.grossPaise)} />
      </Grid.Col>
      <Grid.Col span={{ base: 6, md: 3 }}>
        <Stat label="Discounts given" value={formatINR(view.bills.discountPaise)} />
      </Grid.Col>
      <Grid.Col span={{ base: 6, md: 3 }}>
        <Stat label={`Cancelled bills (${view.bills.cancelled})`} value={formatINR(view.bills.cancelledPaise)} color={view.bills.cancelled ? 'orange' : undefined} />
      </Grid.Col>
      <Grid.Col span={{ base: 6, md: 3 }}>
        <Stat label="Refunds" value={formatINR(view.refundsPaise)} />
      </Grid.Col>
    </Grid>
  )
}

function RejectModal({ closing, onClose }: { closing: CashClosing; onClose: () => void }) {
  const [note, setNote] = useState('')
  const decide = useDecideClosing()
  return (
    <Modal opened onClose={onClose} title={`Send back ${closing.cashierName}'s handover`}>
      <Stack>
        <Text size="sm">The receipts go back to {closing.cashierName}'s counter to be counted again.</Text>
        <Textarea label="Note for the cashier" withAsterisk data-autofocus value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" disabled={!note.trim()} loading={decide.isPending} onClick={() => decide.mutate({ id: closing.id, accept: false, note }, { onSuccess: onClose, onError: (e) => showApiError(e) })}>
            Send back
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function ReopenModal({ date, onClose }: { date: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const reopen = useReopenDay()
  return (
    <Modal opened onClose={onClose} title={`Reopen ${formatDay(date)}`}>
      <Stack>
        <Text size="sm">Payments can be taken on this date again. Close the day again when done. This is recorded in the audit log.</Text>
        <Textarea label="Reason" withAsterisk data-autofocus value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="orange" disabled={!reason.trim()} loading={reopen.isPending} onClick={() => reopen.mutate({ date, reason }, { onSuccess: onClose, onError: (e) => showApiError(e) })}>
            Reopen day
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
