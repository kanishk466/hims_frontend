import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'

/** Ask before deactivating a master row. Reactivating needs no confirmation. */
export function confirmDeactivate(name: string, consequence: string, onConfirm: () => void) {
  modals.openConfirmModal({
    title: `Deactivate ${name}?`,
    children: (
      <Text size="sm">
        {consequence} Nothing is deleted: past records keep it, and you can reactivate it from the Inactive filter.
      </Text>
    ),
    labels: { confirm: 'Deactivate', cancel: 'Keep active' },
    confirmProps: { color: 'red' },
    onConfirm,
  })
}
