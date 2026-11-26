import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Checkbox, ColorSwatch, Group, Input, Modal, SegmentedControl, Stack, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { notifySaved, showApiError } from '@/lib/apiErrors'
import { departmentInputSchema, QUEUE_COLORS, type Department, type DepartmentInput } from '@/types/masters'
import { useSaveDepartment } from './queries'

export function DepartmentFormModal({ opened, onClose, department }: { opened: boolean; onClose: () => void; department: Department | null }) {
  const save = useSaveDepartment()
  const { register, control, handleSubmit, reset, setError, formState } = useForm<DepartmentInput>({ resolver: zodResolver(departmentInputSchema) })

  useEffect(() => {
    if (opened) reset(department ? { name: department.name, code: department.code, type: department.type, queueColor: department.queueColor, casualty: !!department.casualty } : { name: '', code: undefined, type: 'clinical', queueColor: 'teal', casualty: false })
  }, [opened, department, reset])

  const onSubmit = handleSubmit((input) =>
    save.mutate(
      { id: department?.id, input: { ...input, code: input.code || undefined } },
      {
        onSuccess: (d) => {
          notifySaved(`${d.name} saved.`)
          onClose()
        },
        onError: (e) => showApiError(e, setError),
      },
    ),
  )

  return (
    <Modal opened={opened} onClose={onClose} title={department ? `Edit ${department.name}` : 'Add department'}>
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          <TextInput label="Name" withAsterisk data-autofocus {...register('name')} error={formState.errors.name?.message} />
          <TextInput
            label="Code"
            description={department ? 'Short code used on reports' : 'Leave empty to create one from the name'}
            maxLength={8}
            {...register('code', { setValueAs: (v: string) => (v ? v.toUpperCase() : undefined) })}
            error={formState.errors.code?.message}
          />
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Input.Wrapper label="Type">
                <SegmentedControl
                  fullWidth
                  mt={4}
                  data={[
                    { value: 'clinical', label: 'Clinical (has OPD)' },
                    { value: 'nonClinical', label: 'Non-clinical (lab, radiology…)' },
                  ]}
                  {...field}
                />
              </Input.Wrapper>
            )}
          />
          <Checkbox
            label="Casualty / emergency department"
            description="Its doctors receive emergency registrations, with E-tokens (E1, E2…) ahead of everyone"
            {...register('casualty')}
          />
          <Controller
            control={control}
            name="queueColor"
            render={({ field }) => (
              <Input.Wrapper label="Queue colour" description="Colour of this department’s tokens on the TV screen">
                <Group gap={8} mt={6}>
                  {QUEUE_COLORS.map((c) => (
                    <Tooltip key={c} label={c}>
                      <UnstyledButton onClick={() => field.onChange(c)} aria-label={`Colour ${c}`} aria-pressed={field.value === c}>
                        <ColorSwatch color={`var(--mantine-color-${c}-6)`} size={26}>
                          {field.value === c && <IconCheck size={14} color="white" />}
                        </ColorSwatch>
                      </UnstyledButton>
                    </Tooltip>
                  ))}
                </Group>
              </Input.Wrapper>
            )}
          />
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
