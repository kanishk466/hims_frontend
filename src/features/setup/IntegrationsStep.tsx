import { Alert, Badge, Button, Divider, Group, Loader, Stack, Switch, Text, Textarea, Title } from '@mantine/core'
import { IconFlask } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useCan } from '@/auth/useCan'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { integrationSettingsSchema, MESSAGE_EVENT_LABELS, MESSAGE_EVENTS, MESSAGE_PLACEHOLDERS, type IntegrationSettings } from '@/types/clinic'
import { useIntegrationSettings, useMessageTemplates, useUpdateIntegrationSettings, useUpdateMessageTemplates } from './queries'
import { StepFooter } from './StepFooter'

/**
 * Wizard step 8 (optional): ABDM/ABHA, SMS/WhatsApp and UPI. Everything here is simulated —
 * turning a switch on never calls a real gateway or health registry.
 */
export function IntegrationsStep({ onNext }: { onNext: () => void }) {
  const { data: settings } = useIntegrationSettings()
  const save = useUpdateIntegrationSettings()
  const canEdit = useCan('admin.setup.edit')
  const form = useForm<IntegrationSettings>({ defaultValues: { abdmEnabled: false, smsEnabled: false, whatsappEnabled: false, upiEnabled: true } })
  const { control, handleSubmit, reset } = form

  useEffect(() => {
    if (settings) reset({ abdmEnabled: settings.abdmEnabled, smsEnabled: settings.smsEnabled, whatsappEnabled: settings.whatsappEnabled, upiEnabled: settings.upiEnabled })
  }, [settings, reset])

  const submit = (next: boolean) =>
    handleSubmit((values) =>
      save.mutate(integrationSettingsSchema.parse(values), {
        onSuccess: () => {
          notifySaved('Integration settings saved.')
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
            Integrations
          </Title>
          <Badge variant="light" color="gray">
            optional
          </Badge>
        </Group>
        <Alert variant="light" color="gray" icon={<IconFlask />}>
          This is a demo environment: every switch below is simulated. No message, payment or health-registry call ever leaves the browser.
        </Alert>
        <Controller
          control={control}
          name="abdmEnabled"
          render={({ field }) => (
            <Switch
              label="ABDM / ABHA"
              description="Lets front office link a patient's ABHA number and a simulated-verify button on the patient record."
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
              disabled={!canEdit}
            />
          )}
        />
        <Controller
          control={control}
          name="smsEnabled"
          render={({ field }) => (
            <Switch
              label="SMS"
              description="Bill receipts and appointment reminders can be sent by SMS (logged in the app; never actually sent in this demo)."
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
              disabled={!canEdit}
            />
          )}
        />
        <Controller
          control={control}
          name="whatsappEnabled"
          render={({ field }) => (
            <Switch
              label="WhatsApp"
              description="Same messages can also be sent by WhatsApp (also simulated and logged, not actually sent)."
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
              disabled={!canEdit}
            />
          )}
        />
        <Controller
          control={control}
          name="upiEnabled"
          render={({ field }) => (
            <Switch
              label="UPI QR at the counter"
              description="Shows a scannable UPI QR code on the billing screen for patients paying by phone."
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
              disabled={!canEdit}
            />
          )}
        />
        <Text size="xs" c="dimmed">
          The UPI ID itself is set in OPD settings.
        </Text>
        <StepFooter canEdit={canEdit} saving={save.isPending} onSkip={onNext} />
      </Stack>
      {(settings.smsEnabled || settings.whatsappEnabled) && <MessageTemplatesEditor canEdit={canEdit} />}
    </form>
  )
}

/** Shown once SMS or WhatsApp is turned on: the wording those simulated sends use. */
function MessageTemplatesEditor({ canEdit }: { canEdit: boolean }) {
  const { data: templates } = useMessageTemplates()
  const save = useUpdateMessageTemplates()
  const [edited, setEdited] = useState<Record<string, string>>({})

  if (!templates) return <Loader />
  const value = (k: string) => edited[k] ?? templates[k as keyof typeof templates]

  return (
    <>
      <Divider my="md" label="Message templates" />
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          What a simulated SMS or WhatsApp send actually says. Use the placeholders shown under each box; they're filled in when a message is sent.
        </Text>
        {MESSAGE_EVENTS.map((k) => (
          <Textarea
            key={k}
            label={MESSAGE_EVENT_LABELS[k]}
            description={`Placeholders: ${MESSAGE_PLACEHOLDERS[k].map((p) => `{${p}}`).join(', ')}`}
            value={value(k)}
            onChange={(e) => setEdited((x) => ({ ...x, [k]: e.currentTarget.value }))}
            autosize
            minRows={2}
            maxLength={400}
            disabled={!canEdit}
          />
        ))}
        {canEdit && (
          <Group justify="flex-end">
            <Button
              type="button"
              variant="default"
              loading={save.isPending}
              disabled={Object.keys(edited).length === 0}
              onClick={() =>
                save.mutate(
                  { billReceipt: value('billReceipt'), appointmentReminder: value('appointmentReminder') },
                  { onSuccess: () => { notifySaved('Message templates saved.'); setEdited({}) }, onError: (e) => showApiError(e) },
                )
              }
            >
              Save templates
            </Button>
          </Group>
        )}
      </Stack>
    </>
  )
}
