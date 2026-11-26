import { Group, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconCheck, IconChevronRight, IconMinus } from '@tabler/icons-react'
import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Permission } from '@/auth/permissions'
import { usePermissions } from '@/auth/useCan'
import { visitFlow, type FlowStep, type FlowStepKey } from '@/lib/opd/flow'
import type { VisitRow } from '@/types/opd'

/** Where each step is done, and who may open it. */
const TARGET: Record<FlowStepKey, { permission: Permission; to: (v: VisitRow) => string; page: string }> = {
  register: { permission: 'opd.registration.view', to: (v) => `/opd/patients/${v.patientId}`, page: 'patient record' },
  checkin: { permission: 'opd.queue.view', to: () => '/opd/queue', page: 'queue' },
  pay: { permission: 'opd.billing.view', to: (v) => `/opd/billing?visit=${v.id}`, page: 'billing' },
  vitals: { permission: 'opd.vitals.view', to: (v) => `/opd/vitals?visit=${v.id}`, page: 'vitals' },
  doctor: { permission: 'opd.workbench.view', to: (v) => `/opd/workbench/${v.id}`, page: 'consultation' },
  done: { permission: 'opd.billing.view', to: (v) => `/opd/billing?visit=${v.id}`, page: 'billing' },
}

const COLORS: Record<FlowStep['state'], { bg: string; fg: string; border: string }> = {
  done: { bg: 'var(--mantine-color-teal-0)', fg: 'var(--mantine-color-teal-8)', border: 'var(--mantine-color-teal-3)' },
  current: { bg: 'var(--mantine-color-orange-6)', fg: 'white', border: 'var(--mantine-color-orange-6)' },
  todo: { bg: 'white', fg: 'var(--mantine-color-gray-6)', border: 'var(--mantine-color-gray-3)' },
  skipped: { bg: 'var(--mantine-color-gray-0)', fg: 'var(--mantine-color-gray-5)', border: 'var(--mantine-color-gray-3)' },
}

const STATE_WORD: Record<FlowStep['state'], string> = { done: 'done', current: 'next', todo: 'not yet', skipped: 'skipped' }

/**
 * The patient's journey through today's OPD visit. The next step is orange; a step opens its
 * screen when the user may view it. `here` marks the screen the strip is shown on.
 */
export function VisitFlow({ visit, here }: { visit: VisitRow; here?: FlowStepKey }) {
  const perms = usePermissions()
  const navigate = useNavigate()
  const steps = visitFlow(visit)
  return (
    <Group gap={4} wrap="wrap" role="list" aria-label="Visit progress">
      {steps.map((s, i) => {
        const target = TARGET[s.key]
        const canOpen = s.key !== here && perms.has(target.permission) && !['cancelled', 'noShow'].includes(visit.status)
        const c = COLORS[s.state]
        const chip = (
          <UnstyledButton
            role="listitem"
            aria-label={`${s.label}: ${STATE_WORD[s.state]}${canOpen ? `, open ${target.page}` : ''}`}
            aria-current={s.key === here ? 'step' : undefined}
            onClick={canOpen ? () => navigate(target.to(visit)) : undefined}
            style={{
              cursor: canOpen ? 'pointer' : 'default',
              background: c.bg,
              color: c.fg,
              border: `1px solid ${c.border}`,
              outline: s.key === here ? '2px solid var(--mantine-color-blue-4)' : undefined,
              outlineOffset: 1,
              borderRadius: 999,
              padding: '2px 10px',
              textDecoration: s.state === 'skipped' ? 'line-through' : undefined,
            }}
          >
            <Group gap={4} wrap="nowrap">
              {s.state === 'done' && <IconCheck size={13} />}
              {s.state === 'skipped' && <IconMinus size={13} />}
              <Text size="xs" fw={s.state === 'current' ? 700 : 500} c="inherit">
                {s.label}
                {s.note ? ` · ${s.note}` : ''}
              </Text>
            </Group>
          </UnstyledButton>
        )
        return (
          <Fragment key={s.key}>
            {i > 0 && <IconChevronRight size={12} color="var(--mantine-color-gray-4)" />}
            {canOpen ? (
              <Tooltip label={`Open ${target.page}`} openDelay={400}>
                {chip}
              </Tooltip>
            ) : (
              chip
            )}
          </Fragment>
        )
      })}
    </Group>
  )
}
