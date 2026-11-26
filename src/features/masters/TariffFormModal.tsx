import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Grid, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconInfoCircle } from '@tabler/icons-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useCan } from '@/auth/useCan'
import { MoneyInput } from '@/components/MoneyInput'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { addDays, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { tariffInputSchema, type TariffInput, type TariffRow } from '@/types/masters'
import { useCreateTariff, useDoctors, usePanels, useServices, useValueList } from './queries'

const ANY = '__any'
const toYmd = (d: Date | string | null) =>
  d ? (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : ''

interface Props {
  opened: boolean
  onClose: () => void
  /** "Change rate": start from this row's combination; the new row is a new version. */
  from: TariffRow | null
}

/** Add a rate. Rates are never edited in place: a change is a new version from a date. */
export function TariffFormModal({ opened, onClose, from }: Props) {
  const create = useCreateTariff()
  const canApprove = useCan('masters.tariffs.approve')
  const { data: services } = useServices()
  const { data: doctors } = useDoctors()
  const { data: panels } = usePanels()
  const { data: visitTypes } = useValueList('visitType')
  const { data: categories } = useValueList('patientCategory')
  const { control, register, handleSubmit, reset, setError, formState } = useForm<TariffInput>({ resolver: zodResolver(tariffInputSchema) })

  useEffect(() => {
    if (!opened) return
    reset(
      from
        ? { serviceId: from.serviceId, doctorId: from.doctorId, visitType: from.visitType, payerId: from.payerId, patientCategory: from.patientCategory, amountPaise: from.amountPaise, validFrom: addDays(todayIST(), 1), note: '' }
        : { serviceId: '', doctorId: null, visitType: null, payerId: null, patientCategory: null, amountPaise: 0, validFrom: todayIST(), note: '' },
    )
  }, [opened, from, reset])

  const onSubmit = handleSubmit((input) =>
    create.mutate(input, {
      onSuccess: (row) => {
        notifySaved(row.status === 'pending' ? 'Rate saved. It applies once Accounts approves it.' : 'Rate saved.')
        onClose()
      },
      onError: (e) => showApiError(e, setError),
    }),
  )

  const anySelect = (name: 'doctorId' | 'visitType' | 'payerId' | 'patientCategory', label: string, anyLabel: string, data: { value: string; label: string }[]) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          label={label}
          data={[{ value: ANY, label: anyLabel }, ...data]}
          value={field.value ?? ANY}
          onChange={(v) => field.onChange(!v || v === ANY ? null : v)}
          searchable
          allowDeselect={false}
          disabled={!!from}
        />
      )}
    />
  )

  return (
    <Modal opened={opened} onClose={onClose} title={from ? 'Change rate (new version)' : 'Add rate'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {from && (
            <Alert variant="light" icon={<IconInfoCircle />}>
              The current rate is {formatINR(from.amountPaise)}. The new rate applies from the date you choose; bills before that date keep the old price.
            </Alert>
          )}
          <Controller
            control={control}
            name="serviceId"
            render={({ field, fieldState }) => (
              <Select
                label="Service"
                withAsterisk
                searchable
                data-autofocus
                disabled={!!from}
                data={(services ?? []).map((s) => ({ value: s.id, label: `${s.code} – ${s.name}` }))}
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
                error={fieldState.error?.message}
              />
            )}
          />
          <Text size="xs" c="dimmed" mt={-8}>
            Leave a field as “any” to make the rate apply more widely. The most specific rate wins at billing.
          </Text>
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>{anySelect('doctorId', 'Doctor', 'Any doctor', (doctors ?? []).map((d) => ({ value: d.id, label: d.name })))}</Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              {anySelect('payerId', 'Payer', 'Any payer', [{ value: 'cash', label: 'Cash (self-pay)' }, ...(panels ?? []).map((p) => ({ value: p.id, label: p.name }))])}
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>{anySelect('visitType', 'Visit type', 'Any visit type', (visitTypes ?? []).map((v) => ({ value: v.code, label: v.label })))}</Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              {anySelect('patientCategory', 'Patient category', 'Any category', (categories ?? []).map((v) => ({ value: v.code, label: v.label })))}
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={control}
                name="amountPaise"
                render={({ field, fieldState }) => <MoneyInput label="Rate" withAsterisk value={field.value} onChange={(v) => field.onChange(v ?? 0)} error={fieldState.error?.message} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={control}
                name="validFrom"
                render={({ field, fieldState }) => (
                  <DatePickerInput label="Valid from" withAsterisk valueFormat="DD-MM-YYYY" value={field.value || null} onChange={(d) => field.onChange(toYmd(d))} error={fieldState.error?.message} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label="Note" placeholder="e.g. 2027 rate card" {...register('note')} />
            </Grid.Col>
          </Grid>
          {!canApprove && (
            <Text size="sm" c="orange.8">
              You can propose rates; they apply after someone with Approve on Tariffs (usually Accounts) approves them.
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              {canApprove ? 'Save rate' : 'Submit for approval'}
            </Button>
          </Group>
          {formState.errors.root && <Text c="red">{formState.errors.root.message}</Text>}
        </Stack>
      </form>
    </Modal>
  )
}
