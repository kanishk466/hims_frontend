import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Grid, Group, Modal, MultiSelect, Select, Stack, Switch, TextInput } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { MoneyInput } from '@/components/MoneyInput'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { GST_RATES, SAMPLE_TYPES, SERVICE_GROUP_LABELS, SERVICE_GROUPS, serviceInputSchema, type Service, type ServiceInput } from '@/types/masters'
import { useDepartments, useSaveService, useServices } from './queries'

const blank: ServiceInput = { code: '', name: '', group: 'procedure', departmentId: null, defaultRatePaise: 0, gstPercent: 0, sac: '999316', openPrice: false, sampleType: null, includedServiceIds: [] }

export function ServiceFormModal({ opened, onClose, service }: { opened: boolean; onClose: () => void; service: Service | null }) {
  const save = useSaveService()
  const { data: departments } = useDepartments()
  const { data: services } = useServices()
  const { register, control, handleSubmit, reset, setError, formState } = useForm<ServiceInput>({ resolver: zodResolver(serviceInputSchema) })
  const group = useWatch({ control, name: 'group' })

  useEffect(() => {
    if (opened) reset(service ? { ...blank, ...service, includedServiceIds: service.includedServiceIds ?? [] } : blank)
  }, [opened, service, reset])

  const onSubmit = handleSubmit((input) =>
    save.mutate(
      { id: service?.id, input },
      {
        onSuccess: (s) => {
          notifySaved(`${s.name} saved.`)
          onClose()
        },
        onError: (e) => showApiError(e, setError),
      },
    ),
  )
  const e = formState.errors

  return (
    <Modal opened={opened} onClose={onClose} title={service ? `Edit ${service.name}` : 'Add service'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {service?.auto && (
            <Alert variant="light" icon={<IconInfoCircle />}>
              The OPD consultation service is priced from each doctor’s fees. Its code and group are fixed.
            </Alert>
          )}
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput
                label="Code"
                withAsterisk
                data-autofocus
                readOnly={service?.auto}
                maxLength={12}
                {...register('code', { setValueAs: (v: string) => v.toUpperCase().trim() })}
                error={e.code?.message}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label="Name (as printed on the bill)" withAsterisk {...register('name')} error={e.name?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={control}
                name="group"
                render={({ field }) => (
                  <Select label="Group" data={SERVICE_GROUPS.map((g) => ({ value: g, label: SERVICE_GROUP_LABELS[g] }))} allowDeselect={false} disabled={service?.auto} {...field} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={control}
                name="departmentId"
                render={({ field }) => (
                  <Select label="Department (optional)" data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} clearable value={field.value ?? null} onChange={field.onChange} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={control}
                name="defaultRatePaise"
                render={({ field, fieldState }) => (
                  <MoneyInput label="Default rate" description="When no tariff matches" withAsterisk value={field.value} onChange={(v) => field.onChange(v ?? 0)} error={fieldState.error?.message} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Controller
                control={control}
                name="gstPercent"
                render={({ field }) => (
                  <Select
                    label="GST"
                    description="Most healthcare services: 0%"
                    data={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))}
                    allowDeselect={false}
                    value={String(field.value)}
                    onChange={(v) => field.onChange(Number(v))}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <TextInput label="SAC code" description="For GST invoices" {...register('sac')} />
            </Grid.Col>
            {group === 'investigation' && (
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller
                  control={control}
                  name="sampleType"
                  render={({ field }) => <Select label="Sample type" data={[...SAMPLE_TYPES]} clearable value={field.value ?? null} onChange={field.onChange} />}
                />
              </Grid.Col>
            )}
            {group === 'package' && (
              <Grid.Col span={12}>
                <Controller
                  control={control}
                  name="includedServiceIds"
                  render={({ field, fieldState }) => (
                    <MultiSelect
                      label="Included services"
                      withAsterisk
                      searchable
                      data={(services ?? []).filter((s) => s.group !== 'package' && s.id !== service?.id).map((s) => ({ value: s.id, label: `${s.code} – ${s.name}` }))}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </Grid.Col>
            )}
            <Grid.Col span={12}>
              <Controller
                control={control}
                name="openPrice"
                render={({ field }) => (
                  <Switch
                    label="Open price"
                    description="The cashier types the amount at billing (e.g. dressing of varying size)"
                    checked={field.value}
                    onChange={(ev) => field.onChange(ev.currentTarget.checked)}
                  />
                )}
              />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
