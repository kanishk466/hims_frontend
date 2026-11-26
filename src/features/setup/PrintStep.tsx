import { Badge, Group, Loader, Select, Stack, Switch, Text, Textarea, Title } from '@mantine/core'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useCan } from '@/auth/useCan'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { PAPER_SIZE_LABELS, PAPER_SIZES, printSettingsSchema, type PrintSettings } from '@/types/clinic'
import { usePrintSettings, useUpdatePrintSettings } from './queries'
import { StepFooter } from './StepFooter'

/** Wizard step 7 (optional): paper size, logo on prints and a receipt/slip footer note. */
export function PrintStep({ onNext }: { onNext: () => void }) {
  const { data: settings } = usePrintSettings()
  const save = useUpdatePrintSettings()
  const canEdit = useCan('admin.setup.edit')
  const form = useForm<PrintSettings>({ defaultValues: { paperSize: 'A4', showLogoOnPrints: true, footerNote: '' } })
  const { control, handleSubmit, reset } = form

  useEffect(() => {
    if (settings) reset({ paperSize: settings.paperSize, showLogoOnPrints: settings.showLogoOnPrints, footerNote: settings.footerNote })
  }, [settings, reset])

  const submit = (next: boolean) =>
    handleSubmit((values) =>
      save.mutate(printSettingsSchema.parse(values), {
        onSuccess: () => {
          notifySaved('Print & branding settings saved.')
          if (next) onNext()
        },
        onError: (e) => showApiError(e),
      }),
    )()

  if (!settings) return <Loader />

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(true) }}>
      <Stack gap="md">
        <Group gap="xs">
          <Title order={3} fz="h4">
            Print and branding
          </Title>
          <Badge variant="light" color="gray">
            optional
          </Badge>
        </Group>
        <Text c="dimmed">Prescriptions, bills and OPD slips already print with your clinic's name, address and logo. Fine-tune the paper size and a footer line here.</Text>
        <Controller
          control={control}
          name="paperSize"
          render={({ field }) => (
            <Select
              label="Paper size"
              data={PAPER_SIZES.map((p) => ({ value: p, label: PAPER_SIZE_LABELS[p] }))}
              value={field.value}
              onChange={(v) => field.onChange(v ?? 'A4')}
              disabled={!canEdit}
              w={260}
            />
          )}
        />
        <Controller
          control={control}
          name="showLogoOnPrints"
          render={({ field }) => <Switch label="Show the clinic logo on prints" checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} disabled={!canEdit} />}
        />
        <Controller
          control={control}
          name="footerNote"
          render={({ field }) => (
            <Textarea label="Footer note" placeholder="e.g. Thank you for choosing us. Get well soon!" maxLength={160} autosize minRows={2} value={field.value ?? ''} onChange={field.onChange} disabled={!canEdit} />
          )}
        />
        <StepFooter canEdit={canEdit} saving={save.isPending} onSkip={onNext} />
      </Stack>
    </form>
  )
}
