import { ActionIcon, Card, Group, Stack, Text, Title } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import type { ReactNode } from 'react'

interface FormPageProps {
  title: string
  subtitle?: ReactNode
  /** Usually navigate(-1) or back to the list screen. */
  onBack: () => void
  children: ReactNode
  /** Card max width. Forms with two-column layouts (Grid) want this wider. */
  width?: number | string
}

/**
 * Chrome for a converted modal-to-page form (Stage 7a): a back arrow + title, and a card
 * around the form. The form itself keeps its own Cancel/Save footer (Cancel now navigates
 * back instead of calling onClose) — this component only supplies the page frame.
 */
export function FormPage({ title, subtitle, onBack, children, width = 640 }: FormPageProps) {
  return (
    <Stack gap="lg">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={onBack} aria-label="Back" mt={2}>
          <IconArrowLeft size={20} />
        </ActionIcon>
        <Stack gap={2}>
          <Title order={2} fz="h3">
            {title}
          </Title>
          {subtitle && (
            <Text c="dimmed" size="sm">
              {subtitle}
            </Text>
          )}
        </Stack>
      </Group>
      <Card withBorder radius="md" p="lg" maw={width}>
        {children}
      </Card>
    </Stack>
  )
}
