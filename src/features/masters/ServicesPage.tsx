import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, Menu, Modal, Select, Stack, Switch, Table, Tabs, Text, TextInput, ThemeIcon, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useQuery } from '@tanstack/react-query'
import { IconCalculator, IconCheck, IconDots, IconFileSpreadsheet, IconHistory, IconPencil, IconPlus, IconRestore, IconSearch, IconTrash, IconX } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { checkPrice } from '@/api/tariffs'
import { Can } from '@/auth/Can'
import { useCan } from '@/auth/useCan'
import { ActiveFilter } from '@/components/ActiveFilter'
import { confirmDeactivate } from '@/components/confirmDeactivate'
import { ExcelImportModal } from '@/components/ExcelImportModal'
import { PageHeader } from '@/components/PageHeader'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { formatDay, todayIST } from '@/lib/dates'
import { matchImportOption, type ImportColumn } from '@/lib/excelImport'
import { matchesActive, matchesText, type ActiveFilterValue } from '@/lib/filters'
import { formatINR } from '@/lib/money'
import { SERVICE_GROUP_LABELS, SERVICE_GROUPS, serviceInputSchema, type Service, type ServiceInput, type TariffRow } from '@/types/masters'
import { useApproveTariff, useCancelTariff, useDoctors, usePanels, useSaveService, useServices, useSetServiceActive, useTariffs, useValueList } from './queries'

/** Masters → Services & tariffs: services, their versioned rates, and a price check. */
export function ServicesPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'services'
  const canTariffs = useCan('masters.tariffs.view')
  return (
    <Stack gap="lg">
      <PageHeader title="Services & tariffs" subtitle="What the hospital bills for, and at what rate for each doctor, payer, visit type and patient category." />
      <Tabs value={tab} onChange={(v) => setParams(v && v !== 'services' ? { tab: v } : {})} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="services">Services</Tabs.Tab>
          {canTariffs && <Tabs.Tab value="tariffs">Tariffs</Tabs.Tab>}
          {canTariffs && (
            <Tabs.Tab value="price" leftSection={<IconCalculator size={16} />}>
              Price check
            </Tabs.Tab>
          )}
        </Tabs.List>
        <Tabs.Panel value="services" pt="md">
          <ServicesTab />
        </Tabs.Panel>
        <Tabs.Panel value="tariffs" pt="md">
          <TariffsTab />
        </Tabs.Panel>
        <Tabs.Panel value="price" pt="md">
          <PriceCheckTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

/* ---------------- Services ---------------- */

const SERVICE_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'code', header: 'Code', example: 'ECG' },
  { key: 'name', header: 'Name', example: 'ECG' },
  { key: 'group', header: 'Group', example: SERVICE_GROUP_LABELS.procedure },
  { key: 'defaultRate', header: 'Default rate (₹)', example: '250' },
  { key: 'gstPercent', header: 'GST %', example: '0' },
  { key: 'openPrice', header: 'Open price (Yes/No)', example: 'No' },
]

function serviceRowToInput(values: Record<string, string>): { input: ServiceInput } | { error: string } {
  const group = matchImportOption(
    values.group ?? '',
    SERVICE_GROUPS.map((g) => ({ value: g, label: SERVICE_GROUP_LABELS[g] })),
  )
  if (!group) return { error: `Unknown group "${values.group}"` }
  const candidate = {
    code: (values.code ?? '').toUpperCase(),
    name: values.name ?? '',
    group,
    departmentId: null,
    defaultRatePaise: Math.round(Number(values.defaultRate ?? '0') * 100),
    gstPercent: Number(values.gstPercent ?? '0'),
    openPrice: ['yes', 'y', 'true', '1'].includes((values.openPrice ?? '').trim().toLowerCase()),
  }
  const parsed = serviceInputSchema.safeParse(candidate)
  return parsed.success ? { input: parsed.data } : { error: parsed.error.issues[0]?.message ?? 'Invalid row' }
}

function ServicesTab() {
  const navigate = useNavigate()
  const { data: services } = useServices(true)
  const setActive = useSetServiceActive()
  const canEdit = useCan('masters.services.edit')
  const canCancel = useCan('masters.services.cancel')
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [filter, setFilter] = useState<ActiveFilterValue>('active')
  const [importOpen, setImportOpen] = useState(false)
  const saveService = useSaveService()

  const rows = useMemo(() => (services ?? []).filter((s) => matchesActive(s.active, filter) && (!group || s.group === group) && matchesText(q, s.name, s.code)), [services, filter, group, q])
  const active = (services ?? []).filter((s) => s.active).length
  const name = (id: string) => services?.find((s) => s.id === id)?.code ?? '?'

  const toggle = (s: Service) => {
    const run = () => setActive.mutate({ id: s.id, active: !s.active }, { onSuccess: () => notifySaved(`${s.name} ${s.active ? 'deactivated' : 'reactivated'}.`), onError: (e) => showApiError(e) })
    if (s.active) confirmDeactivate(s.name, 'It can no longer be added to bills or orders.', run)
    else run()
  }

  return (
    <Card withBorder radius="md" p={0}>
      <Group p="sm" justify="space-between">
        <Group gap="sm">
          <TextInput placeholder="Search name or code" leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={240} aria-label="Search services" autoFocus />
          <Select placeholder="All groups" data={SERVICE_GROUPS.map((g) => ({ value: g, label: SERVICE_GROUP_LABELS[g] }))} value={group} onChange={setGroup} clearable w={180} aria-label="Filter by group" />
        </Group>
        <Group gap="sm">
          <ActiveFilter value={filter} onChange={setFilter} counts={{ active, inactive: (services?.length ?? 0) - active }} />
          <Can permission="masters.services.create">
            <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} onClick={() => setImportOpen(true)}>
              Import from Excel
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/masters/services/new')}>
              Add service
            </Button>
          </Can>
        </Group>
      </Group>
      <Table.ScrollContainer minWidth={860}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Code</Table.Th>
              <Table.Th>Service</Table.Th>
              <Table.Th>Group</Table.Th>
              <Table.Th ta="right">Default rate</Table.Th>
              <Table.Th>GST</Table.Th>
              <Table.Th>SAC</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="lg">
                    No services match.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((s) => (
              <Table.Tr key={s.id} style={s.active ? undefined : { opacity: 0.6 }}>
                <Table.Td>
                  <Text size="sm" ff="monospace">
                    {s.code}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <Text size="sm" fw={500}>
                      {s.name}
                    </Text>
                    {s.auto && (
                      <Badge size="xs" variant="light">
                        priced from doctor fees
                      </Badge>
                    )}
                    {s.openPrice && (
                      <Badge size="xs" variant="light" color="gray">
                        open price
                      </Badge>
                    )}
                    {!s.active && (
                      <Badge size="xs" variant="light" color="gray">
                        Inactive
                      </Badge>
                    )}
                  </Group>
                  {s.group === 'package' && (
                    <Text size="xs" c="dimmed">
                      Includes {s.includedServiceIds?.map(name).join(', ')}
                    </Text>
                  )}
                  {s.sampleType && (
                    <Text size="xs" c="dimmed">
                      Sample: {s.sampleType}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{SERVICE_GROUP_LABELS[s.group]}</Text>
                </Table.Td>
                <Table.Td ta="right">{s.auto ? <Text size="sm" c="dimmed">per doctor</Text> : formatINR(s.defaultRatePaise)}</Table.Td>
                <Table.Td>{s.gstPercent}%</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {s.sac}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {(canEdit || canCancel) && (
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${s.name}`}>
                          <IconDots size={18} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {canEdit && (
                          <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => navigate(`/masters/services/${s.id}/edit`)}>
                            Edit
                          </Menu.Item>
                        )}
                        {s.active && canCancel && !s.auto && (
                          <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={() => toggle(s)}>
                            Deactivate
                          </Menu.Item>
                        )}
                        {!s.active && canEdit && (
                          <Menu.Item leftSection={<IconRestore size={16} />} onClick={() => toggle(s)}>
                            Reactivate
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
      <ExcelImportModal<ServiceInput>
        opened={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import services from Excel"
        templateFilename="services-template.xlsx"
        columns={SERVICE_IMPORT_COLUMNS}
        toInput={serviceRowToInput}
        importRow={(input) => saveService.mutateAsync({ input })}
      />
    </Card>
  )
}

/* ---------------- Tariffs ---------------- */

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  pending: { color: 'yellow', label: 'Pending' },
  cancelled: { color: 'gray', label: 'Cancelled' },
  current: { color: 'teal', label: 'In use' },
  future: { color: 'blue', label: 'Starts later' },
  past: { color: 'gray', label: 'Superseded' },
}

function TariffsTab() {
  const navigate = useNavigate()
  const { data: services } = useServices()
  const { data: panels } = usePanels()
  const { data: doctors } = useDoctors()
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [payerId, setPayerId] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [history, setHistory] = useState(false)
  const { data: rows, isFetching } = useTariffs({ serviceId: serviceId ?? undefined, payerId: payerId ?? undefined, doctorId: doctorId ?? undefined, history })
  const approve = useApproveTariff()
  const canCreate = useCan('masters.tariffs.create')
  const canApprove = useCan('masters.tariffs.approve')
  const canCancel = useCan('masters.tariffs.cancel')
  const [cancelling, setCancelling] = useState<TariffRow | null>(null)
  const today = todayIST()
  const pending = (rows ?? []).filter((r) => r.status === 'pending').length

  return (
    <Stack>
      {pending > 0 && canApprove && (
        <Alert color="yellow" variant="light" title={`${pending} rate${pending > 1 ? 's' : ''} waiting for your approval`}>
          Rates proposed by staff without Approve do not apply until approved. They are listed first.
        </Alert>
      )}
      <Card withBorder radius="md" p={0}>
        <Group p="sm" justify="space-between">
          <Group gap="sm">
            <Select placeholder="All services" searchable clearable w={240} data={(services ?? []).map((s) => ({ value: s.id, label: `${s.code} – ${s.name}` }))} value={serviceId} onChange={setServiceId} aria-label="Filter by service" />
            <Select
              placeholder="All payers"
              clearable
              w={200}
              data={[{ value: 'any', label: 'Any payer (general)' }, { value: 'cash', label: 'Cash only' }, ...(panels ?? []).map((p) => ({ value: p.id, label: p.name }))]}
              value={payerId}
              onChange={setPayerId}
              aria-label="Filter by payer"
            />
            <Select placeholder="All doctors" searchable clearable w={200} data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={setDoctorId} aria-label="Filter by doctor" />
            <Switch label="Show history" checked={history} onChange={(e) => setHistory(e.currentTarget.checked)} />
          </Group>
          <Can permission="masters.tariffs.create">
            <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/masters/services/tariffs/new')}>
              Add rate
            </Button>
          </Can>
        </Group>
        <Table.ScrollContainer minWidth={1050}>
          <Table highlightOnHover verticalSpacing={8} style={{ opacity: isFetching ? 0.7 : 1 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Service</Table.Th>
                <Table.Th>Doctor</Table.Th>
                <Table.Th>Payer</Table.Th>
                <Table.Th>Visit type</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th ta="right">Rate</Table.Th>
                <Table.Th>Valid</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows?.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Text c="dimmed" ta="center" py="lg">
                      No rates for this filter. Services without a rate are billed at their default rate.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows?.map((r) => {
                const badge = STATUS_BADGE[r.status === 'approved' ? r.period : r.status]!
                const any = <Text size="sm" c="dimmed">any</Text>
                return (
                  <Table.Tr key={r.id} style={r.status === 'cancelled' || r.period === 'past' ? { opacity: 0.55 } : undefined}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {r.serviceName}
                      </Text>
                      {r.note && (
                        <Text size="xs" c="dimmed">
                          {r.note}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{r.doctorName ?? any}</Table.Td>
                    <Table.Td>{r.payerName ?? any}</Table.Td>
                    <Table.Td>{r.visitTypeLabel ?? any}</Table.Td>
                    <Table.Td>{r.categoryLabel ?? any}</Table.Td>
                    <Table.Td ta="right" fw={600}>
                      {formatINR(r.amountPaise)}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {formatDay(r.validFrom)}
                        {r.validTo ? ` – ${formatDay(r.validTo)}` : ' onwards'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={badge.color}>
                        {badge.label}
                      </Badge>
                      {r.status === 'pending' && (
                        <Text size="xs" c="dimmed">
                          by {r.createdByName}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${r.serviceName} rate`}>
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {r.status === 'pending' && canApprove && (
                            <Menu.Item leftSection={<IconCheck size={16} />} color="teal" onClick={() => approve.mutate(r.id, { onSuccess: () => notifySaved('Rate approved.'), onError: (e) => showApiError(e) })}>
                              Approve
                            </Menu.Item>
                          )}
                          {r.status === 'approved' && r.period !== 'past' && canCreate && (
                            <Menu.Item leftSection={<IconHistory size={16} />} onClick={() => navigate(`/masters/services/tariffs/${r.id}/change`)}>
                              Change rate (new version)
                            </Menu.Item>
                          )}
                          {canCancel && (r.status === 'pending' || (r.status === 'approved' && r.validFrom > today)) && (
                            <Menu.Item leftSection={<IconX size={16} />} color="red" onClick={() => setCancelling(r)}>
                              {r.status === 'pending' ? 'Reject' : 'Cancel this rate'}
                            </Menu.Item>
                          )}
                          {r.status === 'approved' && r.validFrom <= today && (
                            <Menu.Label>Rates in use cannot be cancelled. Add a new version instead.</Menu.Label>
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
      <CancelTariffModal row={cancelling} onClose={() => setCancelling(null)} />
    </Stack>
  )
}

function CancelTariffModal({ row, onClose }: { row: TariffRow | null; onClose: () => void }) {
  const cancel = useCancelTariff()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setReason('')
    setError(null)
    onClose()
  }
  const submit = () => {
    if (!reason.trim()) return setError('Enter a reason')
    cancel.mutate({ id: row!.id, reason }, { onSuccess: () => { notifySaved('Rate cancelled.'); close() }, onError: (e) => showApiError(e) })
  }
  return (
    <Modal opened={!!row} onClose={close} title={row?.status === 'pending' ? 'Reject this rate?' : 'Cancel this rate?'}>
      <Stack>
        {row && (
          <Text size="sm">
            {row.serviceName}: {formatINR(row.amountPaise)} from {formatDay(row.validFrom)}
          </Text>
        )}
        <TextInput
          label="Reason"
          withAsterisk
          data-autofocus
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          error={error}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Keep it
          </Button>
          <Button color="red" onClick={submit} loading={cancel.isPending}>
            {row?.status === 'pending' ? 'Reject' : 'Cancel rate'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/* ---------------- Price check ---------------- */

const toYmd = (d: Date | string | null) =>
  d ? (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : todayIST()

function PriceCheckTab() {
  const { data: services } = useServices()
  const { data: doctors } = useDoctors()
  const { data: panels } = usePanels()
  const { data: visitTypes } = useValueList('visitType')
  const { data: categories } = useValueList('patientCategory')
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [payerId, setPayerId] = useState<string>('cash')
  const [visitType, setVisitType] = useState<string>('new')
  const [category, setCategory] = useState<string>('general')
  const [date, setDate] = useState(todayIST())
  const query = { serviceId: serviceId ?? '', doctorId, payerId, visitType, patientCategory: category, date }
  const { data: price } = useQuery({ queryKey: ['priceCheck', query], queryFn: () => checkPrice(query), enabled: !!serviceId })

  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, md: 5 }}>
        <Card withBorder radius="md">
          <Stack>
            <Text size="sm" c="dimmed">
              Pick a patient situation to see exactly what billing will charge, and why.
            </Text>
            <Select label="Service" searchable data-autofocus data={(services ?? []).map((s) => ({ value: s.id, label: `${s.code} – ${s.name}` }))} value={serviceId} onChange={setServiceId} placeholder="Choose a service" />
            <Select label="Doctor" searchable clearable data={(doctors ?? []).map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={setDoctorId} placeholder="No doctor" />
            <Select label="Payer" allowDeselect={false} data={[{ value: 'cash', label: 'Cash (self-pay)' }, ...(panels ?? []).map((p) => ({ value: p.id, label: p.name }))]} value={payerId} onChange={(v) => setPayerId(v ?? 'cash')} />
            <Group grow>
              <Select label="Visit type" allowDeselect={false} data={(visitTypes ?? []).map((v) => ({ value: v.code, label: v.label }))} value={visitType} onChange={(v) => setVisitType(v ?? 'new')} />
              <Select label="Patient category" allowDeselect={false} data={(categories ?? []).map((v) => ({ value: v.code, label: v.label }))} value={category} onChange={(v) => setCategory(v ?? 'general')} />
            </Group>
            <DatePickerInput label="Visit date" valueFormat="DD-MM-YYYY" value={date} onChange={(d) => setDate(toYmd(d))} />
          </Stack>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 7 }}>
        {!serviceId ? (
          <Card withBorder radius="md" py="xl">
            <Group justify="center" gap="sm">
              <ThemeIcon variant="light" size="lg">
                <IconCalculator size={20} />
              </ThemeIcon>
              <Text c="dimmed">Choose a service to see its price.</Text>
            </Group>
          </Card>
        ) : (
          price && (
            <Card withBorder radius="md" aria-live="polite">
              <Stack>
                <div>
                  <Text size="sm" c="dimmed">
                    {price.serviceName} on {formatDay(date)}
                  </Text>
                  <Title order={2} fz={36} aria-label="Price">
                    {formatINR(price.amountPaise)}
                  </Title>
                  <Text size="sm">{price.explanation}</Text>
                </div>
                {price.candidates.length > 0 && (
                  <>
                    <Text size="sm" fw={600}>
                      Rates that could apply (most specific wins)
                    </Text>
                    <Table verticalSpacing={4} fz="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Doctor</Table.Th>
                          <Table.Th>Payer</Table.Th>
                          <Table.Th>Visit</Table.Th>
                          <Table.Th>Category</Table.Th>
                          <Table.Th>From</Table.Th>
                          <Table.Th ta="right">Rate</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {price.candidates.map((c) => (
                          <Table.Tr key={c.id} bg={c.id === price.tariffId ? 'teal.0' : undefined} fw={c.id === price.tariffId ? 600 : undefined}>
                            <Table.Td>{c.doctorName ?? 'any'}</Table.Td>
                            <Table.Td>{c.payerName ?? 'any'}</Table.Td>
                            <Table.Td>{c.visitTypeLabel ?? 'any'}</Table.Td>
                            <Table.Td>{c.categoryLabel ?? 'any'}</Table.Td>
                            <Table.Td>{formatDay(c.validFrom)}</Table.Td>
                            <Table.Td ta="right">{formatINR(c.amountPaise)}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </>
                )}
                <Text size="xs" c="dimmed">
                  Default rate of the service: {formatINR(price.defaultRatePaise)}. Order of preference: doctor, then payer, then visit type, then patient category.
                </Text>
              </Stack>
            </Card>
          )
        )}
      </Grid.Col>
    </Grid>
  )
}
