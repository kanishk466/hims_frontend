import { Badge, Tooltip } from '@mantine/core'
import { IconShieldExclamation } from '@tabler/icons-react'
import type { MlcInfo } from '@/types/opd'

/** Red "MLC" marker on every screen that shows a medico-legal visit. */
export function MlcBadge({ mlc, size = 'sm' }: { mlc?: MlcInfo; size?: 'xs' | 'sm' | 'md' }) {
  if (!mlc) return null
  return (
    <Tooltip label={`MLC ${mlc.mlcNo} · ${mlc.policeStation}${mlc.officerName ? ` · ${mlc.officerName}` : ''}`}>
      <Badge size={size} color="red" variant="filled" leftSection={<IconShieldExclamation size={12} />} style={{ flexShrink: 0 }}>
        MLC
      </Badge>
    </Tooltip>
  )
}

/** Grey "Temporary" marker for an emergency record not yet identified. */
export function TempBadge({ temporary, size = 'sm' }: { temporary?: boolean; size?: 'xs' | 'sm' }) {
  if (!temporary) return null
  return (
    <Tooltip label="Emergency record with a temporary UHID. Identify the patient from the Emergency screen.">
      <Badge size={size} color="gray" variant="outline" style={{ flexShrink: 0 }}>
        Temporary
      </Badge>
    </Tooltip>
  )
}
