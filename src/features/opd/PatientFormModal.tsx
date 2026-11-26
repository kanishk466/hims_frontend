import { zodResolver } from '@hookform/resolvers/zod'
import { Accordion, Alert, Button, Grid, Group, Modal, NumberInput, SegmentedControl, Select, Stack, TagsInput, Text, TextInput, UnstyledButton } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useHotkeys } from '@mantine/hooks'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { isApiError } from '@/api/client'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { todayIST } from '@/lib/dates'
import { patientInputSchema, type Patient, type PatientBrief, type PatientInput } from '@/types/opd'
import { useValueList } from '../masters/queries'
import { dobFromAge, yearsSince } from './format'
import { PatientBadge } from './PatientBadge'
import { useConfirmTemporaryPatient, useSavePatient } from './queries'

interface Props {
  opened: boolean
  onClose: () => void
  /** null = register a new patient */
  patient: Patient | null
  /** Text typed in the search box: used to prefill name or mobile. */
  prefill?: string
  onSaved: (p: Patient) => void
  /** The user chose an existing patient from the duplicate warning. */
  onOpenExisting?: (p: PatientBrief) => void
}

const CHRONIC = ['Hypertension', 'Type 2 diabetes', 'Asthma', 'COPD', 'Hypothyroidism', 'Heart disease', 'Chronic kidney disease', 'Epilepsy', 'Osteoarthritis of knee', 'Pregnancy']

const toYmd = (d: Date | string | null) =>
  d ? (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : ''

function blank(prefill = ''): PatientInput {
  const digits = prefill.replace(/\D/g, '')
  return {
    salutation: undefined,
    name: digits.length >= 6 ? '' : prefill,
    gender: undefined as unknown as PatientInput['gender'],
    dob: '',
    dobApprox: true,
    mobile: digits.length === 10 ? digits : '',
    altMobile: '',
    email: '',
    addressLine: '',
    city: '',
    pinCode: '',
    bloodGroup: null,
    idProofType: null,
    idProofNo: '',
    abhaNumber: '',
    guardianName: '',
    guardianRelation: null,
    referralSource: null,
    category: 'general',
    allergies: [],
    chronicConditions: [],
  }
}

/**
 * Registration in under 60 seconds (OPD-01): only name, gender, age or DOB and mobile
 * are required; everything else is under "More details".
 */
export function PatientFormModal({ opened, onClose, patient, prefill, onSaved, onOpenExisting }: Props) {
  const saveRegular = useSavePatient()
  const confirmTemp = useConfirmTemporaryPatient()
  // An emergency record being identified gets a normal UHID instead of a plain edit.
  const identifying = !!patient?.temporary
  const save = {
    isPending: saveRegular.isPending || confirmTemp.isPending,
    mutate: (vars: { id?: string; input: PatientInput }, opts: { onSuccess: (p: Patient) => void; onError: (e: unknown) => void }) =>
      identifying ? confirmTemp.mutate({ id: vars.id!, input: vars.input }, opts) : saveRegular.mutate(vars, opts),
  }
  const today = todayIST()
  const [dups, setDups] = useState<PatientBrief[] | null>(null)
  const { data: salutations } = useValueList('salutation')
  const { data: categories } = useValueList('patientCategory')
  const { data: bloodGroups } = useValueList('bloodGroup')
  const { data: idProofs } = useValueList('idProof')
  const { data: relations } = useValueList('relation')
  const { data: referrals } = useValueList('referralSource')
  const { data: allergies } = useValueList('allergy')
  const { register, control, handleSubmit, reset, setError, setValue, formState } = useForm<PatientInput>({ resolver: zodResolver(patientInputSchema) })
  const [dob, dobApprox] = useWatch({ control, name: ['dob', 'dobApprox'] })
  const e = formState.errors

  useEffect(() => {
    if (!opened) return
    reset(patient ? { ...blank(), ...patient, name: patient.temporary ? '' : patient.name, altMobile: patient.altMobile ?? '', email: patient.email ?? '' } : blank(prefill))
  }, [opened, patient, prefill, reset])

  const close = () => {
    setDups(null)
    onClose()
  }

  const submit = (confirmNotDuplicate: boolean) =>
    handleSubmit((input) =>
      save.mutate(
        { id: patient?.id, input: { ...input, confirmNotDuplicate } },
        {
          onSuccess: (p) => {
            notifySaved(identifying ? `Identified. New UHID ${p.uhid}` : patient ? 'Patient details saved.' : `Registered. UHID ${p.uhid}`)
            setDups(null)
            onSaved(p)
          },
          onError: (err) => {
            if (isApiError(err) && err.code === 'possible_duplicate') setDups(err.details as PatientBrief[])
            else showApiError(err, setError)
          },
        },
      ),
    )()

  useHotkeys(opened ? [['mod+S', () => submit(false)]] : [], [])
  const age = dob ? yearsSince(dob, today) : undefined

  return (
    <Modal opened={opened} onClose={close} title={identifying ? `Identify emergency patient ${patient!.uhid}` : patient ? `Edit ${patient.name} (${patient.uhid})` : 'Register new patient'} size="xl">
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          submit(false)
        }}
        noValidate
      >
        <Stack>
          {dups && (
            <Alert color="orange" icon={<IconAlertTriangle />} title="This patient may already be registered">
              <Stack gap="xs">
                <Text size="sm">Same mobile number, a similar name and age. Open the existing record, or confirm this is a different person.</Text>
                {dups.map((d) => (
                  <UnstyledButton
                    key={d.id}
                    onClick={() => {
                      setDups(null)
                      onOpenExisting?.(d)
                    }}
                    p="xs"
                    style={{ border: '1px solid var(--mantine-color-orange-3)', borderRadius: 8, background: 'white' }}
                  >
                    <Group justify="space-between">
                      <PatientBadge patient={d} />
                      <Text size="sm" c="teal.8" fw={600}>
                        Use this patient
                      </Text>
                    </Group>
                  </UnstyledButton>
                ))}
                <Group>
                  <Button variant="default" size="xs" onClick={() => submit(true)} loading={save.isPending}>
                    Different person: register anyway
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}

          <Grid gap="sm">
            <Grid.Col span={{ base: 4, sm: 2 }}>
              <Controller
                control={control}
                name="salutation"
                render={({ field }) => <Select label="Title" data={(salutations ?? []).map((s) => ({ value: s.code, label: s.label }))} clearable value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 8, sm: 6 }}>
              <TextInput label="Full name" withAsterisk data-autofocus {...register('name')} error={e.name?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={control}
                name="gender"
                render={({ field, fieldState }) => (
                  <Stack gap={4}>
                    <Text size="sm" fw={500}>
                      Gender <span style={{ color: 'var(--mantine-color-red-6)' }}>*</span>
                    </Text>
                    <SegmentedControl
                      fullWidth
                      data={[
                        { value: 'M', label: 'Male' },
                        { value: 'F', label: 'Female' },
                        { value: 'O', label: 'Other' },
                      ]}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      aria-label="Gender"
                    />
                    {fieldState.error && (
                      <Text size="xs" c="red">
                        Choose gender
                      </Text>
                    )}
                  </Stack>
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput
                label="Age (years)"
                min={0}
                max={120}
                allowDecimal={false}
                value={age ?? ''}
                onChange={(v) => {
                  if (v === '' || v === undefined) return
                  setValue('dob', dobFromAge(Number(v), today), { shouldValidate: formState.isSubmitted })
                  setValue('dobApprox', true)
                }}
                description={dobApprox && dob ? 'Approximate date of birth' : ' '}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <Controller
                control={control}
                name="dob"
                render={({ field, fieldState }) => (
                  <DatePickerInput
                    label="or date of birth"
                    valueFormat="DD-MM-YYYY"
                    maxDate={new Date()}
                    value={field.value || null}
                    onChange={(d) => {
                      field.onChange(toYmd(d))
                      setValue('dobApprox', false)
                    }}
                    error={fieldState.error?.message}
                    description={dob && !dobApprox ? 'Exact' : ' '}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput label="Mobile number" withAsterisk inputMode="numeric" maxLength={10} description="One number can be shared by family members" {...register('mobile')} error={e.mobile?.message} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={control}
                name="category"
                render={({ field }) => <Select label="Patient category" data={(categories ?? []).map((c) => ({ value: c.code, label: c.label }))} allowDeselect={false} {...field} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={control}
                name="allergies"
                render={({ field }) => <TagsInput label="Allergies" placeholder="Type or pick" data={(allergies ?? []).map((a) => a.label)} value={field.value} onChange={field.onChange} clearable />}
              />
            </Grid.Col>
          </Grid>

          <Accordion variant="contained" chevronPosition="left">
            <Accordion.Item value="more">
              <Accordion.Control>More details (optional): address, ID, ABHA, guardian…</Accordion.Control>
              <Accordion.Panel>
                <Grid gap="sm">
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput label="Address" {...register('addressLine')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <TextInput label="City" {...register('city')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <TextInput label="PIN code" maxLength={6} {...register('pinCode')} error={e.pinCode?.message} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <TextInput label="Alternate mobile" maxLength={10} {...register('altMobile')} error={e.altMobile?.message} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <TextInput label="Email" {...register('email')} error={e.email?.message} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <Controller
                      control={control}
                      name="bloodGroup"
                      render={({ field }) => <Select label="Blood group" data={(bloodGroups ?? []).map((b) => ({ value: b.code, label: b.label }))} clearable value={field.value ?? null} onChange={field.onChange} />}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <Controller
                      control={control}
                      name="idProofType"
                      render={({ field }) => <Select label="ID proof" data={(idProofs ?? []).map((b) => ({ value: b.code, label: b.label }))} clearable value={field.value ?? null} onChange={field.onChange} />}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <TextInput label="ID number" description="Store only the last 4 digits of Aadhaar" {...register('idProofNo')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <TextInput label="ABHA number" placeholder="91-1234-5678-9012" {...register('abhaNumber')} error={e.abhaNumber?.message} description="ABHA create/verify comes with ABDM" />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput label="Guardian / next of kin" {...register('guardianName')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <Controller
                      control={control}
                      name="guardianRelation"
                      render={({ field }) => <Select label="Relation" data={(relations ?? []).map((b) => ({ value: b.code, label: b.label }))} clearable value={field.value ?? null} onChange={field.onChange} />}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    <Controller
                      control={control}
                      name="referralSource"
                      render={({ field }) => <Select label="Heard of us via" data={(referrals ?? []).map((b) => ({ value: b.code, label: b.label }))} clearable value={field.value ?? null} onChange={field.onChange} />}
                    />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <Controller
                      control={control}
                      name="chronicConditions"
                      render={({ field }) => <TagsInput label="Long-term conditions" data={CHRONIC} value={field.value} onChange={field.onChange} clearable />}
                    />
                  </Grid.Col>
                </Grid>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Ctrl+S or Enter saves
            </Text>
            <Group>
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {patient ? 'Save' : 'Register'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
