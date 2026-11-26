import { Badge } from '@mantine/core'
import { VISIT_STATUS_COLORS, VISIT_STATUS_LABELS, type VisitStatus } from '@/types/opd'

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return (
    <Badge size="sm" variant="light" color={VISIT_STATUS_COLORS[status]}>
      {VISIT_STATUS_LABELS[status]}
    </Badge>
  )
}
