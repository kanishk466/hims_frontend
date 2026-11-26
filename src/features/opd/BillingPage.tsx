import { ActionIcon, Alert, Badge, Box, Button, Card, Divider, Grid, Group, Menu, Modal, NumberInput, PinInput, Select, Stack, Table, Tabs, Text, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconAlertTriangle, IconCash, IconCheck, IconDots, IconMessage, IconPlus, IconPrinter, IconQrcode, IconTrash, IconX } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { BillDraft } from '@/api/billing'
import type { SendMessageResult } from '@/api/messages'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { MoneyInput } from '@/components/MoneyInput'
import { PageHeader } from '@/components/PageHeader'
import { QrCode } from '@/components/QrCode'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatTime } from '@/lib/dates'
import { matchesText } from '@/lib/filters'
import { formatINR } from '@/lib/money'
import { changeDue } from '@/lib/opd/billSplit'
import type { BillDraftLine, BillView, Receipt, VisitRow } from '@/types/opd'
import { useServices, useValueList } from '../masters/queries'
import { useIntegrationSettings } from '../setup/queries'
import { PatientBadge } from './PatientBadge'
import { useBillPreview, useBillingContext, useBills, useCancelBill, useCreateBill, useDecideDiscount, useSendMessage, useTakePayment, useVisits } from './queries'
import { MlcBadge } from './MlcBadge'
import { VisitFlow } from './VisitFlow'
import { VisitStatusBadge } from './VisitStatusBadge'

/** OPD Spec screen 5: consultation fee, ordered tests and procedures, payment, receipt. */
export function BillingPage() {
  const [params, setParams] = useSearchParams()
  const visitId = params.get('visit')
  const { data: bills } = useBills()
  const { data: modes } = useValueList('paymentMode')
  const modeLabel = (c: string) => modes?.find((m) => m.code === c)?.label ?? c
  const total = Object.values(bills?.collectedByMode ?? {}).reduce((s, x) => s + x, 0)

  return (
    <Stack gap="lg">
      <PageHeader
        title="Billing counter"
        subtitle={
          <>
            Collected today: <b>{formatINR(total)}</b>
            {Object.entries(bills?.collectedByMode ?? {}).map(([m, a]) => ` · ${modeLabel(m)} ${formatINR(a)}`)}
          </>
        }
      />
      <Can permission="opd.billing.approve">{(bills?.pendingApprovals ?? 0) > 0 && <ApprovalsCard />}</Can>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <VisitList selected={visitId} onSelect={(id) => setParams({ visit: id })} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          {visitId ? (
            <BillingPanel key={visitId} visitId={visitId} />
          ) : (
            <Card withBorder radius="md" py="xl">
              <Text c="dimmed" ta="center">
                Pick a patient on the left. Patients waiting to pay are listed first.
              </Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

function VisitList({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [tab, setTab] = useState<string | null>('due')
  const [q, setQ] = useState('')
  const { data: visits } = useVisits({}, 5000)
  const { data: bills } = useBills()
  const due = (v: VisitRow) => (!v.consultPaid && !v.waiveConsultation && !['cancelled', 'noShow'].includes(v.status)) || v.pendingCharges > 0
  const rows = useMemo(() => (visits ?? []).filter((v) => (tab === 'due' ? due(v) : true) && matchesText(q, v.patient.name, v.patient.uhid, v.token, v.patient.mobile)), [visits, tab, q])

  return (
    <Card withBorder radius="md" p={0}>
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List grow>
          <Tabs.Tab value="due">To bill ({(visits ?? []).filter(due).length})</Tabs.Tab>
          <Tabs.Tab value="all">All today ({visits?.length ?? 0})</Tabs.Tab>
          <Tabs.Tab value="bills">Bills ({bills?.rows.length ?? 0})</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <TextInput m="sm" placeholder="Name, UHID, token or mobile" value={q} onChange={(e) => setQ(e.currentTarget.value)} aria-label="Find a visit" autoFocus />
      <Stack gap={0} mah={560} style={{ overflowY: 'auto' }}>
        {tab === 'bills'
          ? bills?.rows
              .filter((b) => matchesText(q, b.patientName, b.uhid, b.billNo))
              .map((b) => (
                <UnstyledButton key={b.id} onClick={() => onSelect(b.visitId)} px="sm" py={8} style={{ borderTop: '1px solid var(--mantine-color-gray-2)', background: selected === b.visitId ? 'var(--mantine-color-teal-0)' : undefined }}>
                  <Group justify="space-between" wrap="nowrap">
                    <div>
                      <Text size="sm" fw={500}>
                        {b.patientName}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {b.billNo}
                      </Text>
                    </div>
                    <Stack gap={2} align="flex-end">
                      <Text size="sm" fw={600} td={b.status === 'cancelled' ? 'line-through' : undefined}>
                        {formatINR(b.grossPaise)}
                      </Text>
                      <BillStatus status={b.status} pending={b.discountPending} />
                    </Stack>
                  </Group>
                </UnstyledButton>
              ))
          : rows.map((v) => (
              <UnstyledButton key={v.id} onClick={() => onSelect(v.id)} px="sm" py={8} style={{ borderTop: '1px solid var(--mantine-color-gray-2)', background: selected === v.id ? 'var(--mantine-color-teal-0)' : undefined }}>
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
                        {v.doctorName} · {v.payerName}
                      </Text>
                    </div>
                  </Group>
                  <Stack gap={2} align="flex-end">
                    {!v.consultPaid && !v.waiveConsultation && !['cancelled', 'noShow'].includes(v.status) && (
                      <Badge size="xs" color="red" variant="light">
                        consultation due
                      </Badge>
                    )}
                    {v.pendingCharges > 0 && (
                      <Badge size="xs" color="orange" variant="light">
                        {v.pendingCharges} test order{v.pendingCharges > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {!due(v) && <VisitStatusBadge status={v.status} />}
                  </Stack>
                </Group>
              </UnstyledButton>
            ))}
        {tab !== 'bills' && rows.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            Nothing to bill.
          </Text>
        )}
      </Stack>
    </Card>
  )
}

function BillStatus({ status, pending }: { status: BillView['status']; pending?: boolean }) {
  if (pending && status === 'unpaid')
    return (
      <Badge size="xs" color="yellow">
        discount awaiting approval
      </Badge>
    )
  const c = { unpaid: ['red', 'unpaid'], paid: ['teal', 'paid'], cancelled: ['gray', 'cancelled'] }[status]
  return (
    <Badge size="xs" color={c[0]} variant="light">
      {c[1]}
    </Badge>
  )
}

function BillingPanel({ visitId }: { visitId: string }) {
  const { data: ctx } = useBillingContext(visitId)
  const [paying, setPaying] = useState<BillView | null>(null)
  const [cancelling, setCancelling] = useState<BillView | null>(null)
  const [sending, setSending] = useState<BillView | null>(null)
  if (!ctx) return null
  const v = ctx.visit

  return (
    <Stack>
      <Card withBorder radius="md">
        <Group justify="space-between" align="flex-start">
          <PatientBadge patient={v.patient} size="lg" />
          <Stack gap={2} align="flex-end">
            <Text size="sm">
              Token <b>{v.token}</b> · {v.doctorName}
            </Text>
            <Text size="xs" c="dimmed">
              {v.visitTypeLabel} · {v.payerName} · {ctx.categoryLabel}
            </Text>
            <VisitStatusBadge status={v.status} />
            <MlcBadge mlc={v.mlc} />
          </Stack>
        </Group>
        <Box mt="sm">
          <VisitFlow visit={v} here="pay" />
        </Box>
        {ctx.panel && (
          <Text size="xs" c="grape.8" mt="xs">
            {ctx.panel.name}: patient pays {ctx.panel.copayPercent}% co-pay{ctx.panel.excluded.length ? `; ${ctx.panel.excluded.join(', ')} not covered` : ''}
            {ctx.panel.capPaise ? `; panel pays at most ${formatINR(ctx.panel.capPaise)} per visit` : ''}
            {v.panelApprovalNo ? ` · approval ${v.panelApprovalNo}` : ''}
          </Text>
        )}
      </Card>

      {ctx.bills.map((b) => (
        <Card key={b.id} withBorder radius="md" padding="sm" style={b.status === 'cancelled' ? { opacity: 0.6 } : undefined}>
          <Group justify="space-between">
            <Group gap="xs">
              <Text fw={600} ff="monospace">
                {b.billNo}
              </Text>
              <BillStatus status={b.status} pending={b.discount?.status === 'pending'} />
              <Text size="xs" c="dimmed">
                {formatTime(b.createdAt)} · {b.createdByName}
              </Text>
            </Group>
            <Group gap="xs">
              <Text fw={700}>{formatINR(b.patientNetPaise)}</Text>
              {b.status === 'unpaid' && b.discount?.status !== 'pending' && (
                <Can permission="opd.billing.create">
                  <Button size="xs" leftSection={<IconCash size={14} />} onClick={() => setPaying(b)}>
                    Take payment
                  </Button>
                </Can>
              )}
              <BillMenu bill={b} onCancel={() => setCancelling(b)} onSendReceipt={() => setSending(b)} />
            </Group>
          </Group>
          <Text size="xs" c="dimmed">
            {b.lines.map((l) => l.name).join(' · ')}
            {b.panelPaise > 0 ? ` · panel pays ${formatINR(b.panelPaise)}` : ''}
            {b.discount ? ` · discount ${b.discount.percent}% (${b.discount.status})` : ''}
            {b.cancelReason ? ` · cancelled: ${b.cancelReason}` : ''}
          </Text>
        </Card>
      ))}

      {ctx.suggested.length > 0 || ctx.bills.every((b) => b.status !== 'unpaid') ? (
        <BillBuilder key={ctx.suggested.map((s) => s.orderId ?? s.serviceId).join()} visitId={visitId} ctx={ctx} onCreated={(b) => (b.status === 'unpaid' && b.discount?.status !== 'pending' && b.patientNetPaise > 0 ? setPaying(b) : null)} />
      ) : null}
      {paying && <PaymentModal bill={paying} upiId={ctx.upiId} onClose={() => setPaying(null)} />}
      {cancelling && <CancelBillModal bill={cancelling} onClose={() => setCancelling(null)} />}
      {sending && <SendReceiptModal bill={sending} onClose={() => setSending(null)} />}
    </Stack>
  )
}

function BillMenu({ bill, onCancel, onSendReceipt }: { bill: BillView; onCancel: () => void; onSendReceipt: () => void }) {
  const canCancel = useCan('opd.billing.cancel')
  const { data: integrations } = useIntegrationSettings()
  const canSend = (integrations?.smsEnabled || integrations?.whatsappEnabled) && bill.status === 'paid'
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={`Actions for bill ${bill.billNo}`}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Can permission="opd.billing.print">
          <Menu.Item leftSection={<IconPrinter size={16} />} component="a" href={`/print/receipt/${bill.id}?size=a5`} target="_blank">
            Print bill / receipt (A5)
          </Menu.Item>
          <Menu.Item leftSection={<IconPrinter size={16} />} component="a" href={`/print/receipt/${bill.id}?size=thermal`} target="_blank">
            Print on thermal (80 mm)
          </Menu.Item>
        </Can>
        {canSend && (
          <Menu.Item leftSection={<IconMessage size={16} />} onClick={onSendReceipt}>
            Send receipt by SMS/WhatsApp
          </Menu.Item>
        )}
        {canCancel && bill.status !== 'cancelled' && (
          <Menu.Item leftSection={<IconX size={16} />} color="red" onClick={onCancel}>
            Cancel bill{bill.paidPaise ? ' and refund' : ''}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}

function SendReceiptModal({ bill, onClose }: { bill: BillView; onClose: () => void }) {
  const { data: integrations } = useIntegrationSettings()
  const options = [
    integrations?.smsEnabled ? { value: 'sms', label: 'SMS' } : null,
    integrations?.whatsappEnabled ? { value: 'whatsapp', label: 'WhatsApp' } : null,
  ].filter((x): x is { value: string; label: string } => !!x)
  const [channel, setChannel] = useState<string | null>(options[0]?.value ?? null)
  const [sent, setSent] = useState<SendMessageResult | null>(null)
  const send = useSendMessage()
  const submit = () => {
    if (!channel) return
    send.mutate(
      { channel: channel as 'sms' | 'whatsapp', event: 'billReceipt', patientId: bill.patientId, vars: { billNo: bill.billNo, amount: (bill.patientNetPaise / 100).toFixed(2) } },
      { onSuccess: setSent, onError: (e) => showApiError(e) },
    )
  }
  return (
    <Modal opened onClose={onClose} title={`Send receipt · ${bill.billNo}`}>
      <Stack>
        {sent ? (
          <>
            <Text size="sm" c="dimmed">
              Sent to {sent.to} by {sent.channel === 'sms' ? 'SMS' : 'WhatsApp'} (simulated — nothing actually left this app):
            </Text>
            <Text size="sm" p="sm" bg="gray.0" style={{ borderRadius: 8 }}>
              {sent.body}
            </Text>
            <Group justify="flex-end">
              <Button onClick={onClose}>Done</Button>
            </Group>
          </>
        ) : (
          <>
            <Select label="Channel" data={options} value={channel} onChange={setChannel} allowDeselect={false} />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!channel} loading={send.isPending}>
                Send
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}

function BillBuilder({ visitId, ctx, onCreated }: { visitId: string; ctx: NonNullable<ReturnType<typeof useBillingContext>['data']>; onCreated: (b: BillView) => void }) {
  const { data: services } = useServices()
  const { data: reasons } = useValueList('discountReason')
  const create = useCreateBill()
  const [lines, setLines] = useState<BillDraftLine[]>(ctx.suggested)
  const [pct, setPct] = useState(ctx.categoryDiscountPercent)
  const [reason, setReason] = useState<string | null>(ctx.categoryDiscountPercent > 0 ? (reasons?.find((r) => r.label.toLowerCase().includes(ctx.categoryLabel.toLowerCase().split(' ')[0] ?? ''))?.code ?? null) : null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [supUsername, setSupUsername] = useState('')
  const [supPin, setSupPin] = useState('')
  const draft: BillDraft = { lines, discountPercent: pct, discountReason: reason ?? undefined }
  const { data: preview, error } = useBillPreview(visitId, draft)
  const add = (serviceId: string | null) => serviceId && setLines((l) => [...l, { serviceId, qty: 1 }])
  const save = () =>
    create.mutate(
      { visitId, draft: overrideOpen && supUsername && supPin ? { ...draft, supervisorOverride: { username: supUsername, pin: supPin } } : draft },
      {
        onSuccess: (b) => {
          notifySaved(
            b.discount?.status === 'approved' && overrideOpen
              ? `Bill ${b.billNo} saved. Discount approved by ${b.discount.decidedByName}.`
              : b.discount?.status === 'pending'
                ? `Bill ${b.billNo} saved. The discount is waiting for approval.`
                : b.status === 'paid'
                  ? `Bill ${b.billNo}: nothing to collect.`
                  : `Bill ${b.billNo} saved.`,
          )
          onCreated(b)
        },
        onError: (e) => showApiError(e),
      },
    )
  useHotkeys([['mod+Enter', save]], [])
  const svc = (id: string) => services?.find((s) => s.id === id)

  return (
    <Card withBorder radius="md">
      <Stack>
        <Text fw={600}>New bill</Text>
        <Table verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Service</Table.Th>
              <Table.Th w={70}>Qty</Table.Th>
              <Table.Th ta="right">Rate</Table.Th>
              <Table.Th ta="right">Panel</Table.Th>
              <Table.Th ta="right">Patient</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l, i) => {
              const p = preview?.lines[i]
              const s = svc(l.serviceId)
              return (
                <Table.Tr key={`${l.serviceId}-${i}`}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {p?.name ?? s?.name}
                    </Text>
                    {p && (
                      <Tooltip label={p.priceNote} multiline maw={360}>
                        <Text size="xs" c="dimmed" style={{ cursor: 'help' }} truncate maw={300}>
                          {l.orderId ? 'Ordered by doctor · ' : ''}
                          {p.priceNote}
                        </Text>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <NumberInput size="xs" min={1} max={20} value={l.qty} onChange={(x) => setLines((ls) => ls.map((y, j) => (j === i ? { ...y, qty: Number(x) || 1 } : y)))} aria-label="Quantity" />
                  </Table.Td>
                  <Table.Td ta="right">
                    {s?.openPrice ? (
                      <MoneyInput size="xs" w={110} value={l.ratePaise ?? p?.ratePaise} onChange={(x) => setLines((ls) => ls.map((y, j) => (j === i ? { ...y, ratePaise: x ?? 0 } : y)))} aria-label="Rate" />
                    ) : (
                      formatINR(p?.ratePaise ?? 0)
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{p?.panelPaise ? formatINR(p.panelPaise) : '—'}</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {formatINR(p?.patientPaise ?? 0)}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon variant="subtle" color="red" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove ${s?.name}`}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
        <Select
          placeholder="Add a service (type to search)…"
          leftSection={<IconPlus size={14} />}
          searchable
          data={(services ?? []).filter((s) => !s.auto).map((s) => ({ value: s.id, label: `${s.code} – ${s.name}` }))}
          value={null}
          onChange={add}
          aria-label="Add a service"
        />
        <Divider />
        <Grid gap="sm" align="flex-end">
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Discount" suffix=" %" min={0} max={100} allowDecimal={false} value={pct} onChange={(x) => setPct(Number(x) || 0)} description={`Your limit: ${ctx.myDiscountLimit}%`} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <Select label="Reason" data={(reasons ?? []).map((r) => ({ value: r.code, label: r.label }))} value={reason} onChange={setReason} disabled={pct === 0} clearable error={pct > 0 && !reason ? 'Choose a reason' : undefined} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            {preview && (
              <Stack gap={2} align="flex-end">
                <Text size="sm" c="dimmed">
                  Total {formatINR(preview.grossPaise)}
                  {preview.panelPaise ? ` · panel ${formatINR(preview.panelPaise)}` : ''}
                  {preview.discountPaise ? ` · discount −${formatINR(preview.discountPaise)}` : ''}
                </Text>
                <Text size="xl" fw={800} aria-label="To collect">
                  {formatINR(preview.discountNeedsApproval ? preview.patientGrossPaise : preview.patientNetPaise)}
                </Text>
              </Stack>
            )}
          </Grid.Col>
        </Grid>
        {preview?.discountNeedsApproval && (
          <Alert color="yellow" icon={<IconAlertTriangle />} p="xs">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm">{pct}% is above your limit. The bill will wait for an approver (Admin, Accounts or MD); collect payment after approval.</Text>
                {!overrideOpen && (
                  <Button size="compact-xs" variant="default" onClick={() => setOverrideOpen(true)}>
                    Use a supervisor's PIN instead
                  </Button>
                )}
              </Group>
              {overrideOpen && (
                <Group gap="xs" align="center" wrap="wrap">
                  <TextInput
                    size="xs"
                    placeholder="Supervisor's username"
                    value={supUsername}
                    onChange={(e) => setSupUsername(e.currentTarget.value)}
                    aria-label="Supervisor's username"
                    w={180}
                  />
                  <PinInput size="xs" length={4} type="number" value={supPin} onChange={setSupPin} aria-label="Supervisor's PIN" />
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => {
                      setOverrideOpen(false)
                      setSupUsername('')
                      setSupPin('')
                    }}
                  >
                    Cancel
                  </Button>
                </Group>
              )}
            </Stack>
          </Alert>
        )}
        {error && <Alert color="red">{(error as Error).message}</Alert>}
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Ctrl+Enter saves the bill
          </Text>
          <Can permission="opd.billing.create">
            <Button size="md" onClick={save} loading={create.isPending} disabled={!lines.length || (pct > 0 && !reason)}>
              Save bill
            </Button>
          </Can>
        </Group>
      </Stack>
    </Card>
  )
}

function PaymentModal({ bill, upiId, onClose }: { bill: BillView; upiId: string; onClose: () => void }) {
  const { data: modes } = useValueList('paymentMode')
  const pay = useTakePayment()
  const due = bill.patientNetPaise - bill.paidPaise
  const [rows, setRows] = useState<{ mode: string; amountPaise: number; reference: string }[]>([{ mode: 'cash', amountPaise: due, reference: '' }])
  const [tendered, setTendered] = useState<number | undefined>(undefined)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const entered = rows.reduce((s, r) => s + (r.amountPaise || 0), 0)
  const needsRef = (m: string) => !!modes?.find((x) => x.code === m)?.meta.needsReference
  const upiRow = rows.find((r) => r.mode === 'upi')
  const cashRow = rows.find((r) => r.mode === 'cash')
  const submit = () =>
    pay.mutate(
      { billId: bill.id, input: { lines: rows.map((r) => ({ mode: r.mode, amountPaise: r.amountPaise, reference: r.reference || undefined })) } },
      { onSuccess: (r) => { setReceipt(r); notifySaved(`Receipt ${r.receiptNo}`) }, onError: (e) => showApiError(e) },
    )

  if (receipt)
    return (
      <Modal opened onClose={onClose} title="Payment received" centered>
        <Stack align="center">
          <IconCheck size={40} color="var(--mantine-color-teal-6)" />
          <Title order={2}>{formatINR(receipt.totalPaise)}</Title>
          <Text ff="monospace">{receipt.receiptNo}</Text>
          <Group>
            <Can permission="opd.billing.print">
              <Button leftSection={<IconPrinter size={16} />} component="a" href={`/print/receipt/${bill.id}?size=thermal&autoprint=1`} target="_blank" data-autofocus>
                Print receipt (80 mm)
              </Button>
              <Button variant="default" component="a" href={`/print/receipt/${bill.id}?size=a5&autoprint=1`} target="_blank">
                A5
              </Button>
            </Can>
            <Button variant="subtle" onClick={onClose}>
              Done
            </Button>
          </Group>
        </Stack>
      </Modal>
    )

  return (
    <Modal opened onClose={onClose} title={`Take payment · ${bill.billNo}`} size="lg">
      <Stack>
        <Group justify="space-between">
          <Text>{bill.patient.name}</Text>
          <Title order={2} aria-label="Amount due">
            {formatINR(due)}
          </Title>
        </Group>
        <Group gap="xs">
          {['cash', 'upi', 'card'].map((m) => (
            <Button key={m} variant="light" size="xs" onClick={() => setRows([{ mode: m, amountPaise: due, reference: '' }])}>
              All {modes?.find((x) => x.code === m)?.label ?? m}
            </Button>
          ))}
          <Button variant="subtle" size="xs" onClick={() => setRows((r) => [...r, { mode: 'upi', amountPaise: Math.max(0, due - entered), reference: '' }])}>
            Split payment
          </Button>
        </Group>
        {rows.map((r, i) => (
          <Group key={i} align="flex-end" wrap="nowrap">
            <Select
              label={i === 0 ? 'Mode' : undefined}
              data={(modes ?? []).map((m) => ({ value: m.code, label: m.label }))}
              value={r.mode}
              onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, mode: v ?? 'cash' } : x)))}
              allowDeselect={false}
              w={180}
            />
            <MoneyInput label={i === 0 ? 'Amount' : undefined} value={r.amountPaise} onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amountPaise: v ?? 0 } : x)))} w={140} />
            {needsRef(r.mode) && (
              <TextInput label={i === 0 || needsRef(r.mode) ? 'Reference (UTR / approval code)' : undefined} value={r.reference} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, reference: e.currentTarget.value } : x)))} style={{ flex: 1 }} withAsterisk />
            )}
            {rows.length > 1 && (
              <ActionIcon variant="subtle" color="red" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove payment line" mb={4}>
                <IconTrash size={14} />
              </ActionIcon>
            )}
          </Group>
        ))}
        {entered !== due && (
          <Text size="sm" c="red">
            Entered {formatINR(entered)}: {entered < due ? `${formatINR(due - entered)} short` : `${formatINR(entered - due)} too much`}.
          </Text>
        )}
        {cashRow && (
          <Group align="flex-end">
            <MoneyInput label="Cash given by patient" value={tendered} onChange={setTendered} w={180} />
            {tendered !== undefined && (
              <Text size="lg" fw={700} c={tendered >= cashRow.amountPaise ? 'teal' : 'red'}>
                {tendered >= cashRow.amountPaise ? `Return ${formatINR(changeDue(tendered, cashRow.amountPaise))}` : 'Not enough'}
              </Text>
            )}
          </Group>
        )}
        {upiRow && upiRow.amountPaise > 0 && (
          <Card withBorder radius="md" p="sm">
            <Group>
              <QrCode value={`upi://pay?pa=${upiId}&pn=${encodeURIComponent('Hospital')}&am=${(upiRow.amountPaise / 100).toFixed(2)}&tn=${encodeURIComponent(bill.billNo)}&cu=INR`} label="UPI payment QR code" size={140} />
              <Stack gap={4}>
                <Group gap={6}>
                  <IconQrcode size={16} />
                  <Text fw={600}>Patient scans to pay {formatINR(upiRow.amountPaise)}</Text>
                </Group>
                <Text size="sm" c="dimmed">
                  UPI ID {upiId}. Enter the UTR from the patient’s app as the reference.
                </Text>
                <Text size="xs" c="dimmed">
                  Demo: the live system confirms the payment through the gateway.
                </Text>
              </Stack>
            </Group>
          </Card>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Later
          </Button>
          <Button size="md" onClick={submit} loading={pay.isPending} disabled={entered !== due || rows.some((r) => needsRef(r.mode) && !r.reference)}>
            Confirm {formatINR(due)} received
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function CancelBillModal({ bill, onClose }: { bill: BillView; onClose: () => void }) {
  const { data: reasons } = useValueList('cancelReason')
  const cancel = useCancelBill()
  const [reason, setReason] = useState<string | null>(null)
  return (
    <Modal opened onClose={onClose} title={`Cancel bill ${bill.billNo}?`}>
      <Stack>
        <Text size="sm">
          The bill stays on record as cancelled.{bill.paidPaise ? ` A refund receipt of ${formatINR(bill.paidPaise)} is created: return the money to the patient.` : ''}
        </Text>
        <Select label="Reason" withAsterisk data={(reasons ?? []).map((r) => ({ value: r.label, label: r.label }))} value={reason} onChange={setReason} data-autofocus />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Keep bill
          </Button>
          <Button color="red" disabled={!reason} loading={cancel.isPending} onClick={() => cancel.mutate({ billId: bill.id, reason: reason! }, { onSuccess: () => { notifySaved(`Bill ${bill.billNo} cancelled.`); onClose() }, onError: (e) => showApiError(e) })}>
            Cancel bill
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function ApprovalsCard() {
  const { data: bills } = useBills()
  const decide = useDecideDiscount()
  const pending = (bills?.rows ?? []).filter((b) => b.discountPending && b.status !== 'cancelled')
  return (
    <Card withBorder radius="md" style={{ borderColor: 'var(--mantine-color-yellow-4)' }}>
      <Text fw={600} mb="xs">
        Discounts waiting for your approval
      </Text>
      {pending.map((b) => (
        <Group key={b.id} justify="space-between" py={4}>
          <Text size="sm">
            {b.patientName} · {b.billNo} · <b>{b.discountPercent}%</b> on {formatINR(b.patientNetPaise)} · asked by {b.createdByName}
          </Text>
          <Group gap="xs">
            <Button size="xs" color="teal" onClick={() => decide.mutate({ billId: b.id, approve: true }, { onSuccess: () => notifySaved('Discount approved.'), onError: (e) => showApiError(e) })}>
              Approve
            </Button>
            <Button size="xs" variant="default" onClick={() => decide.mutate({ billId: b.id, approve: false }, { onSuccess: () => notifySaved('Discount rejected: full amount due.'), onError: (e) => showApiError(e) })}>
              Reject
            </Button>
          </Group>
        </Group>
      ))}
    </Card>
  )
}

