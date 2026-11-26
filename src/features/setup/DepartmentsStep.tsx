import { ActionIcon, Badge, Button, Chip, ColorSwatch, Group, Loader, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { IconPlus, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { useCan } from '@/auth/useCan'
import { showApiError } from '@/lib/apiErrors'
import { COMMON_DEPARTMENTS, type Department } from '@/types/masters'
import { useDepartments, useSaveDepartment, useSetDepartmentActive } from '../masters/queries'
import { StepFooter } from './StepFooter'

/** Wizard step 2: tick common departments, or type your own. */
export function DepartmentsStep({ onNext }: { onNext: () => void }) {
  const { data: all } = useDepartments(true)
  const save = useSaveDepartment()
  const setActive = useSetDepartmentActive()
  const canCreate = useCan('masters.departments.create')
  const canRemove = useCan('masters.departments.cancel')
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)

  if (!all) return <Loader />
  const active = all.filter((d) => d.active)
  const byName = new Map(all.map((d) => [d.name.toLowerCase(), d]))
  const busy = save.isPending || setActive.isPending

  const add = (name: string, type: Department['type'] = 'clinical', queueColor = 'teal') =>
    save.mutate(
      { input: { name, type, queueColor } },
      { onError: (e) => showApiError(e) },
    )

  const remove = (d: Department) =>
    setActive.mutate({ id: d.id, active: false }, { onError: (e) => showApiError(e) })

  const toggleTemplate = (t: (typeof COMMON_DEPARTMENTS)[number]) => {
    const existing = byName.get(t.name.toLowerCase())
    if (existing?.active) {
      if (canRemove) remove(existing)
    } else if (canCreate) add(t.name, t.type, t.queueColor)
  }

  const addCustom = () => {
    const name = custom.trim()
    if (name.length < 2) return setCustomError('Enter a department name')
    if (byName.get(name.toLowerCase())?.active) return setCustomError(`${name} is already added`)
    setCustomError(null)
    save.mutate(
      { input: { name, type: 'clinical', queueColor: 'teal' } },
      {
        onSuccess: () => setCustom(''),
        onError: (e) => showApiError(e),
      },
    )
  }

  const templateNames = new Set(COMMON_DEPARTMENTS.map((t) => t.name.toLowerCase()))
  const customActive = active.filter((d) => !templateNames.has(d.name.toLowerCase()))

  return (
    <Stack gap="lg">
      <div>
        <Title order={3} fz="h4">
          Departments
        </Title>
        <Text c="dimmed" size="sm">
          Tick the departments that run an OPD. Doctors are added to these in the next step.
        </Text>
      </div>

      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            Common departments
          </Text>
          <Badge variant="light" color={active.length ? 'teal' : 'gray'}>
            {active.length} selected
          </Badge>
        </Group>
        <Group gap={8}>
          {COMMON_DEPARTMENTS.map((t) => {
            const checked = !!byName.get(t.name.toLowerCase())?.active
            return (
              <Chip key={t.code} checked={checked} onChange={() => toggleTemplate(t)} disabled={busy || (checked ? !canRemove : !canCreate)} variant="outline">
                {t.name}
              </Chip>
            )
          })}
        </Group>
      </Stack>

      {canCreate && (
        <Stack gap={6}>
          <Text fw={600} size="sm">
            Another department
          </Text>
          <Group align="flex-start" gap="xs">
            <TextInput
              placeholder="e.g. Diabetology"
              value={custom}
              onChange={(e) => setCustom(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustom()
                }
              }}
              error={customError}
              w={280}
              aria-label="New department name"
            />
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={addCustom} loading={save.isPending}>
              Add
            </Button>
          </Group>
          {customActive.length > 0 && (
            <Group gap={8}>
              {customActive.map((d) => (
                <Badge key={d.id} size="lg" variant="outline" color="gray" leftSection={<ColorSwatch color={`var(--mantine-color-${d.queueColor}-5)`} size={10} />}
                  rightSection={
                    canRemove && (
                      <Tooltip label={`Remove ${d.name}`}>
                        <ActionIcon size="xs" variant="transparent" color="gray" onClick={() => remove(d)} aria-label={`Remove ${d.name}`}>
                          <IconX size={12} />
                        </ActionIcon>
                      </Tooltip>
                    )
                  }
                  styles={{ label: { textTransform: 'none' } }}
                >
                  {d.name}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      )}

      <StepFooter
        canEdit
        submit={false}
        onContinue={onNext}
        continueDisabled={active.length === 0}
        hint={active.length === 0 ? 'Pick at least one department to continue.' : 'Saved as you tick. Queue colours and codes can be changed in Masters → Departments.'}
      />
    </Stack>
  )
}
