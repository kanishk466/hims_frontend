import { ActionIcon, Badge, Button, Group, Select, Stack, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import type { Consultation } from '@/api/emr'
import { Can } from '@/auth/Can'
import { showApiError } from '@/lib/apiErrors'
import { useServices } from '../../masters/queries'
import { useCancelOrder, useOrderServices } from '../queries'

const ORDER_STATUS_COLORS = {
  ordered: 'orange',
  billed: 'teal',
  cancelled: 'gray',
} as Record<string, string>
const ORDER_STATUS_LABELS = {
  ordered: 'to be billed',
  billed: 'billed',
  cancelled: 'cancelled',
} as Record<string, string>

/** Tests and procedures (OPD-09): appear at the billing counter as pending charges. */
export function OrdersCard({ c }: { c: Consultation }) {
  const { data: services } = useServices()
  const order = useOrderServices()
  const cancel = useCancelOrder()
  const visitId = c.visit.id
  const orderable = (services ?? []).filter((s) => s.active && s.group !== 'consultation' && s.group !== 'package')
  const live = c.orders.filter((o) => o.status !== 'cancelled')
  const place = (ids: string[]) => order.mutate({ visitId, serviceIds: ids }, { onError: (e) => showApiError(e) })

  return (
    <Stack gap="xs">
      <Can permission="opd.orders.create">
        <Group gap="xs">
          {c.orderSets.map((s) => (
            <Button key={s.id} size="compact-sm" variant="light" onClick={() => place(s.serviceIds)} loading={order.isPending && order.variables?.serviceIds === s.serviceIds}>
              + {s.name}
            </Button>
          ))}
        </Group>
        <Select
          placeholder="Order a test or procedure: type its name or code"
          aria-label="Order a test"
          searchable
          value={null}
          data={orderable.map((s) => ({
            value: s.id,
            label: `${s.name} (${s.code})`,
          }))}
          onChange={(id) => id && place([id])}
          nothingFoundMessage="No such service"
        />
      </Can>
      {live.length === 0 && (
        <Text size="sm" c="dimmed">
          No tests ordered.
        </Text>
      )}
      {live.map((o) => (
        <Group key={o.id} justify="space-between">
          <Group gap="xs">
            <Text size="sm">{o.serviceName}</Text>
            <Badge size="xs" variant="light" color={ORDER_STATUS_COLORS[o.status]}>
              {ORDER_STATUS_LABELS[o.status]}
            </Badge>
          </Group>
          {o.status === 'ordered' && (
            <Can permission="opd.orders.cancel">
              <ActionIcon variant="subtle" color="gray" aria-label={`Cancel ${o.serviceName}`} onClick={() => cancel.mutate(o.id, { onError: (e) => showApiError(e) })}>
                <IconX size={16} />
              </ActionIcon>
            </Can>
          )}
        </Group>
      ))}
    </Stack>
  )
}
