import { Alert, Button, Card, Grid, Group, Loader, Progress, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import { IconCheck, IconConfetti, IconFlask } from '@tabler/icons-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { PageHeader } from '@/components/PageHeader'
import { showApiError } from '@/lib/apiErrors'
import type { SetupStepKey, SetupStepStatus } from '@/types/clinic'
import { DepartmentsStep } from './DepartmentsStep'
import { DoctorsStep } from './DoctorsStep'
import { IntegrationsStep } from './IntegrationsStep'
import { PrintStep } from './PrintStep'
import { ProfileStep } from './ProfileStep'
import { useClinicProfile, useCompleteSetup, useSetupProgress } from './queries'
import { SchedulesStep } from './SchedulesStep'
import { ServicesStep } from './ServicesStep'
import { UsersStep } from './UsersStep'

type View = SetupStepKey | 'finish'

/**
 * The 8-step clinic setup wizard (Onboarding & Masters → Clinic setup wizard).
 * Steps 1–5 are required before the first patient; each step saves on its own.
 */
export function SetupWizardPage() {
  const { data: progress } = useSetupProgress()
  const { data: session } = useSession()
  const complete = useCompleteSetup()
  const { data: clinic } = useClinicProfile()
  const canEdit = useCan('admin.setup.edit')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  if (!progress || !session) return <Loader />

  const firstOpen = progress.steps.find((s) => s.required && !s.done)?.key
  const view = (params.get('step') as View | null) ?? (progress.complete ? 'finish' : firstOpen ?? 'profile')
  const go = (v: View) => setParams({ step: v }, { replace: false })
  const order: SetupStepKey[] = ['profile', 'departments', 'doctors', 'schedules', 'users']
  const next = (from: SetupStepKey) => () => {
    const i = order.indexOf(from)
    const after = order[i + 1]
    if (after) go(after)
    else go(progress.complete ? 'finish' : firstOpen ?? 'profile')
  }
  const optionalOrder: SetupStepKey[] = ['services', 'print', 'integrations']
  const nextOptional = (from: SetupStepKey) => () => {
    const after = optionalOrder[optionalOrder.indexOf(from) + 1]
    go(after ?? (progress.complete ? 'finish' : firstOpen ?? 'profile'))
  }
  const alreadyFinished = !!clinic?.setupCompletedAt

  const finish = () =>
    complete.mutate(undefined, {
      onSuccess: () => navigate('/dashboard'),
      onError: (e) => showApiError(e),
    })

  return (
    <Stack gap="lg">
      <PageHeader
        title="Clinic setup"
        subtitle={progress.complete ? 'All required steps are done. You can come back here any time to change settings.' : 'Five short steps before your first patient. Each step saves on its own, so you can stop and come back.'}
      />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
          <Card withBorder radius="md" padding="sm">
            <Stack gap={4} mb="sm" px={4}>
              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Required steps
                </Text>
                <Text size="sm" c="dimmed">
                  {progress.requiredDone} of {progress.requiredTotal}
                </Text>
              </Group>
              <Progress value={(progress.requiredDone / progress.requiredTotal) * 100} color={progress.complete ? 'teal' : 'blue'} />
            </Stack>
            <Stack gap={2} component="nav" aria-label="Setup steps">
              {progress.steps.map((s, i) => (
                <StepLink key={s.key} step={s} index={i + 1} active={view === s.key} onClick={() => go(s.key)} />
              ))}
              {progress.complete && (
                <UnstyledButton onClick={() => go('finish')} p={8} style={{ borderRadius: 8, background: view === 'finish' ? 'var(--mantine-color-teal-0)' : undefined }}>
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon size={26} radius="xl" color="teal">
                      <IconConfetti size={15} />
                    </ThemeIcon>
                    <Text size="sm" fw={600}>
                      Finish
                    </Text>
                  </Group>
                </UnstyledButton>
              )}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
          <Card withBorder radius="md" padding="lg">
            {view === 'profile' && <ProfileStep onNext={next('profile')} canEdit={canEdit} />}
            {view === 'departments' && <DepartmentsStep onNext={next('departments')} />}
            {view === 'doctors' && <DoctorsStep onNext={next('doctors')} />}
            {view === 'schedules' && <SchedulesStep onNext={next('schedules')} />}
            {view === 'users' && <UsersStep onNext={next('users')} finishReady={progress.complete} />}
            {view === 'services' && <ServicesStep onNext={nextOptional('services')} />}
            {view === 'print' && <PrintStep onNext={nextOptional('print')} />}
            {view === 'integrations' && <IntegrationsStep onNext={nextOptional('integrations')} />}
            {view === 'finish' && (
              <Stack gap="md" align="flex-start">
                <ThemeIcon size={56} radius="xl" color="teal">
                  <IconCheck size={32} />
                </ThemeIcon>
                <Title order={3}>{session.clinic?.name} is ready for its first patient</Title>
                <Text c="dimmed" maw={560}>
                  Profile, departments, doctors, schedules and logins are in place. Optional steps (services and tariffs, print layouts, integrations) can be done any time.
                </Text>
                <Alert variant="light" color="gray" icon={<IconFlask />} maw={560}>
                  <Text size="sm">
                    <b>Test visit</b> — registers a sample patient, checks them in, bills, consults and prints the prescription, then removes the test data. Available once the OPD screens are built (build step 5).
                  </Text>
                </Alert>
                <Group>
                  {canEdit && !alreadyFinished && (
                    <Button size="md" onClick={finish} loading={complete.isPending}>
                      Finish setup
                    </Button>
                  )}
                  <Button size="md" variant={alreadyFinished ? 'filled' : 'default'} onClick={() => navigate('/dashboard')}>
                    Go to dashboard
                  </Button>
                </Group>
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

function StepLink({ step, index, active, onClick }: { step: SetupStepStatus; index: number; active: boolean; onClick: () => void }) {
  const color = step.done ? 'teal' : step.required ? 'blue' : 'gray'
  return (
    <UnstyledButton
      onClick={onClick}
      p={8}
      aria-current={active ? 'step' : undefined}
      style={{ borderRadius: 8, background: active ? 'var(--mantine-color-teal-0)' : undefined }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={26} radius="xl" color={color} variant={step.done ? 'filled' : 'light'}>
          {step.done ? <IconCheck size={15} /> : <Text size="xs" fw={700}>{index}</Text>}
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={active ? 700 : 500} c={step.required ? undefined : 'dimmed'}>
            {step.label}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {step.hint}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  )
}
