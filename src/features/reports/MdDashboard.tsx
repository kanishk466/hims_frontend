import { BarChart, LineChart } from '@mantine/charts'
import { Badge, Card, Grid, Group, Progress, Stack, Table, Text, UnstyledButton } from '@mantine/core'
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { useCan } from '@/auth/useCan'
import { formatINR } from '@/lib/money'
import { useMdDashboard } from './queries'

/** Owner / MD view on the dashboard: today, live doctor load, the last 30 days. Tiles open the matching report. */
export function MdDashboard() {
  const can = useCan('reports.mdDashboard.view')
  const { data: m } = useMdDashboard(can)
  if (!can || !m) return null
  const t = m.today
  const tiles: { label: string; value: string; sub?: string; to: string }[] = [
    { label: 'Patients today', value: String(t.patients), sub: `${t.newPatients} new · ${t.followUps} follow-up${t.emergencies ? ` · ${t.emergencies} emergency` : ''}`, to: '/reports/footfall?range=today' },
    { label: 'Collected today', value: formatINR(t.collectedPaise), sub: t.panelDuesPaise ? `+ ${formatINR(t.panelDuesPaise)} billed to panels` : 'net of refunds', to: '/reports/collection?range=today' },
    { label: 'Waiting now', value: String(t.waitingNow), sub: `${t.inConsultationNow} with a doctor`, to: '/opd/queue' },
    { label: 'Average wait today', value: t.avgWaitMinutes === null ? '—' : `${t.avgWaitMinutes} min`, sub: 'check-in to doctor', to: '/reports/waitingTime?range=today' },
    { label: 'Discounts today', value: formatINR(t.discountsPaise), to: '/reports/discounts?range=today' },
    { label: 'No-shows today', value: String(t.noShows), sub: 'appointments and tokens', to: '/reports/appointments?range=today' },
  ]
  const trend = m.trend.map((d) => ({ day: dayjs(d.date).format('DD MMM'), patients: d.patients, revenue: d.revenue }))
  const maxPayer = Math.max(1, ...m.payerMix.map((p) => p.visits))
  const maxDx = Math.max(1, ...m.topDiagnoses.map((d) => d.count))

  return (
    <Stack gap="md" aria-label="MD dashboard">
      <Group justify="space-between">
        <Text fw={600}>Hospital today</Text>
        <Text size="xs" c="dimmed">
          Updates every 30 seconds
        </Text>
      </Group>
      <Grid>
        {tiles.map((x) => (
          <Grid.Col key={x.label} span={{ base: 6, md: 4, lg: 2 }}>
            <UnstyledButton component={Link} to={x.to} w="100%" h="100%">
              <Card withBorder radius="md" p="sm" h="100%">
                <Text size="xs" c="dimmed">
                  {x.label}
                </Text>
                <Text fw={700} fz={22} lh={1.3}>
                  {x.value}
                </Text>
                {x.sub && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {x.sub}
                  </Text>
                )}
              </Card>
            </UnstyledButton>
          </Grid.Col>
        ))}
      </Grid>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card withBorder radius="md" p={0} h="100%">
            <Text fw={600} p="sm">
              Doctors right now
            </Text>
            <Table verticalSpacing={6} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Doctor</Table.Th>
                  <Table.Th ta="right">Waiting</Table.Th>
                  <Table.Th ta="right">In room</Table.Th>
                  <Table.Th ta="right">Seen</Table.Th>
                  <Table.Th ta="right">Avg wait</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {m.doctors.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center" size="sm" py="xs">
                        No OPD yet today.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {m.doctors.map((d) => (
                  <Table.Tr key={d.doctorId}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {d.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {d.department}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {d.waiting >= 5 ? (
                        <Badge color="orange" variant="light">
                          {d.waiting}
                        </Badge>
                      ) : (
                        d.waiting
                      )}
                    </Table.Td>
                    <Table.Td ta="right">{d.inRoom}</Table.Td>
                    <Table.Td ta="right">{d.done}</Table.Td>
                    <Table.Td ta="right">{d.avgWait === null ? '—' : `${d.avgWait} min`}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card withBorder radius="md" h="100%">
            <Group justify="space-between" mb={4}>
              <Text fw={600}>Last 30 days</Text>
              <Group gap="md">
                <Change label="Patients" pct={m.change.patientsPct} value={m.change.patients30.toLocaleString('en-IN')} />
                <Change label="Collected" pct={m.change.revenuePct} value={formatINR(m.change.revenue30Paise)} />
              </Group>
            </Group>
            <Text size="xs" c="dimmed" mb={4}>
              Patients per day
            </Text>
            <BarChart h={120} data={trend} dataKey="day" series={[{ name: 'patients', label: 'Patients', color: 'teal.6' }]} gridAxis="y" strokeDasharray="2 4" barProps={{ radius: [3, 3, 0, 0] }} xAxisProps={{ interval: 'preserveStartEnd', minTickGap: 16 }} yAxisProps={{ width: 32 }} />
            <Text size="xs" c="dimmed" mt="xs" mb={4}>
              Collected per day
            </Text>
            <LineChart
              h={120}
              data={trend}
              dataKey="day"
              series={[{ name: 'revenue', label: 'Collected', color: 'blue.6' }]}
              curveType="monotone"
              strokeWidth={2}
              withDots={false}
              gridAxis="y"
              strokeDasharray="2 4"
              valueFormatter={(v) => formatINR(v)}
              xAxisProps={{ interval: 'preserveStartEnd', minTickGap: 16 }}
              yAxisProps={{ width: 64, tickFormatter: (v: number) => `₹${Math.round(v / 100000)}k` }}
            />
          </Card>
        </Grid.Col>
      </Grid>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder radius="md" h="100%">
            <Text fw={600} mb="xs">
              Who pays (last 30 days)
            </Text>
            <Stack gap={8}>
              {m.payerMix.map((p) => (
                <div key={p.payer}>
                  <Group justify="space-between">
                    <Text size="sm">{p.payer}</Text>
                    <Text size="sm" c="dimmed">
                      {p.visits} visits · {formatINR(p.grossPaise)}
                    </Text>
                  </Group>
                  <Progress value={(p.visits / maxPayer) * 100} size="sm" color="teal.6" aria-label={`${p.payer}: ${p.visits} visits`} />
                </div>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <UnstyledButton component={Link} to="/reports/diagnoses" w="100%" h="100%">
            <Card withBorder radius="md" h="100%">
              <Text fw={600} mb="xs">
                Top diagnoses (last 30 days)
              </Text>
              <Stack gap={8}>
                {m.topDiagnoses.map((d) => (
                  <div key={d.code}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" truncate>
                        <b>{d.code}</b> {d.name}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {d.count}
                      </Text>
                    </Group>
                    <Progress value={(d.count / maxDx) * 100} size="sm" color="teal.6" aria-label={`${d.code}: ${d.count}`} />
                  </div>
                ))}
              </Stack>
            </Card>
          </UnstyledButton>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

function Change({ label, pct, value }: { label: string; pct: number | null; value: string }) {
  const up = (pct ?? 0) >= 0
  return (
    <div style={{ textAlign: 'right' }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Group gap={4} justify="flex-end">
        <Text size="sm" fw={700}>
          {value}
        </Text>
        {pct !== null && (
          <Text size="xs" c="dimmed">
            {up ? <IconArrowUpRight size={12} /> : <IconArrowDownRight size={12} />}
            {Math.abs(pct)}% vs previous 30
          </Text>
        )}
      </Group>
    </div>
  )
}
