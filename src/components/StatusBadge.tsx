import { Badge } from '@mantine/core'

const COLORS: Record<string, string> = {
  active: 'teal',
  trial: 'blue',
  invited: 'yellow',
  inactive: 'gray',
  suspended: 'red',
}
const LABELS: Record<string, string> = {
  active: 'Active',
  trial: 'Trial',
  invited: 'Invite pending',
  inactive: 'Inactive',
  suspended: 'Suspended',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="light" color={COLORS[status] ?? 'gray'}>
      {LABELS[status] ?? status}
    </Badge>
  )
}
