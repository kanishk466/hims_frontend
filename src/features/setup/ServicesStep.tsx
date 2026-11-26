import { Alert, Badge, Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { IconArrowUpRight, IconInfoCircle } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useCan } from '@/auth/useCan'
import { SERVICE_GROUP_LABELS, SERVICE_GROUPS } from '@/types/masters'
import { useServices } from '../masters/queries'
import { useMarkServicesReviewed } from './queries'
import { StepFooter } from './StepFooter'

/**
 * Wizard step 6 (optional): services and tariffs already live in their own full screen
 * (Masters → Services & tariffs, build step 4) — this step is a summary and a way in.
 */
export function ServicesStep({ onNext }: { onNext: () => void }) {
  const { data: services } = useServices()
  const canEdit = useCan('masters.services.create')
  const review = useMarkServicesReviewed()
  const continueNow = () => review.mutate(undefined, { onSettled: onNext })
  if (!services) return <Loader />
  const byGroup = SERVICE_GROUPS.map((g) => ({ group: g, count: services.filter((s) => s.group === g).length }))
  const customCount = services.filter((s) => !s.auto).length

  return (
    <Stack gap="md">
      <Group gap="xs">
        <Title order={3} fz="h4">
          Services and tariffs
        </Title>
        <Badge variant="light" color="gray">
          optional
        </Badge>
      </Group>
      <Text c="dimmed">
        The OPD consultation fee is created automatically from each doctor's fees. Add procedures, lab tests, health packages or panel-specific rates in Masters → Services & tariffs.
      </Text>
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Group</Table.Th>
            <Table.Th ta="right">Active services</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {byGroup.map((r) => (
            <Table.Tr key={r.group}>
              <Table.Td>{SERVICE_GROUP_LABELS[r.group]}</Table.Td>
              <Table.Td ta="right">{r.count}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {customCount === 0 ? (
        <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
          No services beyond the consultation fee yet. Add procedures, investigations or packages any time — it's optional for go-live.
        </Alert>
      ) : (
        <Alert variant="light" color="teal" icon={<IconInfoCircle />}>
          {customCount} service{customCount === 1 ? '' : 's'} beyond the consultation fee.
        </Alert>
      )}
      <Group>
        <Button component={Link} to="/masters/services" variant="default" rightSection={<IconArrowUpRight size={16} />} disabled={!canEdit}>
          Go to Services & tariffs
        </Button>
      </Group>
      <StepFooter canEdit={true} submit={false} onContinue={continueNow} saving={review.isPending} hint="This step is optional; defaults already work." />
    </Stack>
  )
}
