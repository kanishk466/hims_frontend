import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Grid, Group, Loader, MultiSelect, NumberInput, SegmentedControl, Select, Stack, Switch, Tabs, Text, TextInput, Textarea } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import { MoneyInput } from '@/components/MoneyInput'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { addDays, todayIST } from '@/lib/dates'
import { PANEL_TYPE_LABELS, PANEL_TYPES, panelInputSchema, SERVICE_GROUP_LABELS, SERVICE_GROUPS, type PanelInput } from '@/types/masters'
import { usePanels, useSavePanel, useValueList } from './queries'

const LIST_PATH = '/masters/panels'

const toYmd = (d: Date | string | null) =>
  d ? (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : ''

const blank = (): PanelInput => ({
  code: '',
  name: '',
  type: 'corporate',
  parentId: null,
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  gstin: '',
  contract: { validFrom: todayIST(), validTo: addDays(todayIST(), 364), rateBasis: 'panelTariff', adjustPercent: 0, creditLimitPaise: 0, creditDays: 30, billingCycle: 'monthly' },
  coverage: { copayPercent: 0, copayFixedPaise: 0, excludedGroups: [], perVisitCapPaise: 0 },
  requirements: { documents: [], priorApproval: false, approvalValidityDays: 0 },
})

/** Which tab holds the first error, so a failed save opens it. */
function tabWithError(e: FieldErrors<PanelInput>): string | null {
  if (e.code || e.name || e.type || e.parentId || e.email) return 'details'
  if (e.contract) return 'contract'
  if (e.coverage) return 'coverage'
  if (e.requirements) return 'requirements'
  return null
}

/** Stage 7a: Add/Edit panel, converted from PanelFormModal to its own route. */
export function PanelFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: panels } = usePanels(true)
  const panel = id ? (panels ?? []).find((p) => p.id === id) : null
  const save = useSavePanel()
  const { data: documents } = useValueList('panelDocument')
  const [tab, setTab] = useState<string | null>('details')
  const { register, control, handleSubmit, reset, setError, formState } = useForm<PanelInput>({ resolver: zodResolver(panelInputSchema) })
  const rateBasis = useWatch({ control, name: 'contract.rateBasis' })
  const priorApproval = useWatch({ control, name: 'requirements.priorApproval' })

  const back = () => navigate(LIST_PATH)

  useEffect(() => {
    reset(panel ? { ...blank(), ...panel } : blank())
  }, [panel, reset])

  const onSubmit = handleSubmit(
    (input) =>
      save.mutate(
        { id: panel?.id, input },
        {
          onSuccess: (p) => {
            notifySaved(`${p.name} saved.`)
            back()
          },
          onError: (e) => showApiError(e, setError),
        },
      ),
    (errors) => setTab(tabWithError(errors) ?? tab),
  )
  const e = formState.errors

  if (!panels) return <Loader />
  if (id && !panel) return <Alert color="red">Panel not found.</Alert>

  return (
    <FormPage title={panel ? `Edit ${panel.name}` : 'Add panel'} onBack={back} width={900}>
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          <Tabs value={tab} onChange={setTab} keepMounted>
            <Tabs.List>
              <Tabs.Tab value="details" c={e.code || e.name ? 'red' : undefined}>
                Details
              </Tabs.Tab>
              <Tabs.Tab value="contract" c={e.contract ? 'red' : undefined}>
                Contract
              </Tabs.Tab>
              <Tabs.Tab value="coverage">Coverage</Tabs.Tab>
              <Tabs.Tab value="requirements">Requirements</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="details" pt="md">
              <Grid gap="sm">
                <Grid.Col span={{ base: 12, sm: 3 }}>
                  <TextInput label="Code" withAsterisk data-autofocus maxLength={12} {...register('code', { setValueAs: (v: string) => v.toUpperCase().trim() })} error={e.code?.message} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 9 }}>
                  <TextInput label="Name" withAsterisk {...register('name')} error={e.name?.message} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Controller control={control} name="type" render={({ field }) => <Select label="Type" data={PANEL_TYPES.map((t) => ({ value: t, label: PANEL_TYPE_LABELS[t] }))} allowDeselect={false} {...field} />} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Controller
                    control={control}
                    name="parentId"
                    render={({ field, fieldState }) => (
                      <Select
                        label="Parent (optional)"
                        description="e.g. the insurer behind a TPA"
                        data={(panels ?? []).filter((p) => p.id !== panel?.id).map((p) => ({ value: p.id, label: p.name }))}
                        clearable
                        value={field.value ?? null}
                        onChange={field.onChange}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput label="Contact person" {...register('contactPerson')} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput label="Phone" {...register('phone')} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput label="Email" {...register('email')} error={e.email?.message} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput label="GSTIN" {...register('gstin', { setValueAs: (v: string) => v?.toUpperCase() })} />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Textarea label="Billing address" autosize minRows={2} {...register('address')} />
                </Grid.Col>
              </Grid>
            </Tabs.Panel>

            <Tabs.Panel value="contract" pt="md">
              <Grid gap="sm">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Controller
                    control={control}
                    name="contract.validFrom"
                    render={({ field, fieldState }) => <DatePickerInput label="Valid from" valueFormat="DD-MM-YYYY" value={field.value || null} onChange={(d) => field.onChange(toYmd(d))} error={fieldState.error?.message} />}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Controller
                    control={control}
                    name="contract.validTo"
                    render={({ field, fieldState }) => <DatePickerInput label="Valid to" valueFormat="DD-MM-YYYY" value={field.value || null} onChange={(d) => field.onChange(toYmd(d))} error={fieldState.error?.message} />}
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Text size="sm" fw={500} mb={4}>
                    Rates
                  </Text>
                  <Controller
                    control={control}
                    name="contract.rateBasis"
                    render={({ field }) => (
                      <SegmentedControl
                        data={[
                          { value: 'panelTariff', label: 'Panel’s own rate list' },
                          { value: 'hospitalTariff', label: 'Hospital rates ± %' },
                        ]}
                        {...field}
                      />
                    )}
                  />
                  <Text size="xs" c="dimmed" mt={4}>
                    {rateBasis === 'panelTariff'
                      ? 'Add the panel’s rates in Services & tariffs → Tariffs with this panel as payer. Services without a panel rate use hospital rates.'
                      : 'Every service is billed at the hospital rate adjusted by the percentage below (e.g. −10 for a 10% discount).'}
                  </Text>
                </Grid.Col>
                {rateBasis === 'hospitalTariff' && (
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <Controller
                      control={control}
                      name="contract.adjustPercent"
                      render={({ field }) => <NumberInput label="Adjustment" suffix=" %" min={-100} max={100} allowDecimal={false} value={field.value} onChange={(v) => field.onChange(Number(v) || 0)} />}
                    />
                  </Grid.Col>
                )}
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Controller control={control} name="contract.creditLimitPaise" render={({ field }) => <MoneyInput label="Credit limit" description="0 = no limit" value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Controller
                    control={control}
                    name="contract.creditDays"
                    render={({ field }) => <NumberInput label="Credit days" min={0} max={365} allowDecimal={false} value={field.value} onChange={(v) => field.onChange(Number(v) || 0)} />}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Controller
                    control={control}
                    name="contract.billingCycle"
                    render={({ field }) => (
                      <Select
                        label="Billing cycle"
                        data={[
                          { value: 'monthly', label: 'Monthly statement' },
                          { value: 'perVisit', label: 'Per visit' },
                        ]}
                        allowDeselect={false}
                        {...field}
                      />
                    )}
                  />
                </Grid.Col>
              </Grid>
            </Tabs.Panel>

            <Tabs.Panel value="coverage" pt="md">
              <Grid gap="sm">
                <Grid.Col span={12}>
                  <Text size="sm" c="dimmed">
                    How a bill is split at the counter: the patient pays the co-pay and anything excluded; the panel is billed for the rest.
                  </Text>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Controller
                    control={control}
                    name="coverage.copayPercent"
                    render={({ field }) => <NumberInput label="Patient co-pay" suffix=" %" min={0} max={100} allowDecimal={false} value={field.value} onChange={(v) => field.onChange(Number(v) || 0)} />}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Controller control={control} name="coverage.copayFixedPaise" render={({ field }) => <MoneyInput label="Or fixed co-pay per visit" value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Controller control={control} name="coverage.perVisitCapPaise" render={({ field }) => <MoneyInput label="Panel pays at most, per visit" description="0 = no cap" value={field.value} onChange={(v) => field.onChange(v ?? 0)} />} />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Controller
                    control={control}
                    name="coverage.excludedGroups"
                    render={({ field }) => (
                      <MultiSelect
                        label="Not covered (patient pays in full)"
                        data={SERVICE_GROUPS.map((g) => ({ value: g, label: SERVICE_GROUP_LABELS[g] }))}
                        value={field.value}
                        onChange={field.onChange}
                        clearable
                      />
                    )}
                  />
                </Grid.Col>
              </Grid>
            </Tabs.Panel>

            <Tabs.Panel value="requirements" pt="md">
              <Stack>
                <Controller
                  control={control}
                  name="requirements.documents"
                  render={({ field }) => (
                    <MultiSelect
                      label="Documents needed at check-in"
                      description="Billing is blocked until they are attached (build step 5). Add document types in Value lists → Panel documents."
                      data={(documents ?? []).map((d) => d.label)}
                      value={field.value}
                      onChange={field.onChange}
                      searchable
                      clearable
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="requirements.priorApproval"
                  render={({ field }) => <Switch label="Prior approval needed before treatment" checked={field.value} onChange={(ev) => field.onChange(ev.currentTarget.checked)} />}
                />
                {priorApproval && (
                  <Controller
                    control={control}
                    name="requirements.approvalValidityDays"
                    render={({ field }) => (
                      <NumberInput label="Approval valid for" suffix=" days" min={0} max={365} allowDecimal={false} w={220} value={field.value} onChange={(v) => field.onChange(Number(v) || 0)} />
                    )}
                  />
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
          <Group justify="flex-end">
            <Button variant="default" onClick={back}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save panel
            </Button>
          </Group>
        </Stack>
      </form>
    </FormPage>
  )
}
