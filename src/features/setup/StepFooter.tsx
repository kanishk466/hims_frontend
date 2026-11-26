import { Button, Group, Kbd, Text } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'

interface Props {
  canEdit: boolean
  saving?: boolean
  /** Rendered as a submit button when the step has a form; otherwise a plain "Continue". */
  submit?: boolean
  onContinue?: () => void
  onSkip?: () => void
  continueDisabled?: boolean
  hint?: string
}

/** Bottom bar of each wizard step. */
export function StepFooter({ canEdit, saving, submit = true, onContinue, onSkip, continueDisabled, hint }: Props) {
  return (
    <Group justify="space-between" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
      <Text size="xs" c="dimmed">
        {hint ??
          (submit && canEdit ? (
            <>
              <Kbd size="xs">Ctrl</Kbd> + <Kbd size="xs">S</Kbd> saves · <Kbd size="xs">Enter</Kbd> saves and continues
            </>
          ) : (
            'Changes are saved as you make them.'
          ))}
      </Text>
      <Group gap="xs">
        {onSkip && (
          <Button variant="subtle" color="gray" onClick={onSkip}>
            {canEdit ? 'Skip for now' : 'Next'}
          </Button>
        )}
        {canEdit && (
          <Button
            type={submit ? 'submit' : 'button'}
            onClick={submit ? undefined : onContinue}
            loading={saving}
            disabled={continueDisabled}
            rightSection={<IconArrowRight size={16} />}
          >
            {submit ? 'Save and continue' : 'Continue'}
          </Button>
        )}
      </Group>
    </Group>
  )
}
