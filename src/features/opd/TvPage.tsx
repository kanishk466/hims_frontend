import { Box, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useNow } from '@/lib/useNow'
import { formatTime } from '@/lib/dates'
import { useTvBoard } from './queries'

/**
 * Waiting-area TV (OPD-04): now serving and next tokens per doctor, refreshed every
 * 2 seconds and whenever another tab changes the queue. No patient names on screen.
 */
export function TvPage() {
  const { data } = useTvBoard()
  const now = useNow(15_000)
  if (!data) return (
    <Center h="100vh" bg="dark.8">
      <Loader color="white" />
    </Center>
  )
  return (
    <Box mih="100vh" bg="dark.8" c="white" p="xl">
      <Group justify="space-between" mb="xl">
        <Title order={1} c="white">
          {data.clinicName} · OPD
        </Title>
        <Text fz={32} fw={700}>
          {formatTime(now)}
        </Text>
      </Group>
      {data.doctors.length === 0 && (
        <Center h="60vh">
          <Text fz={32} c="dimmed">
            OPD has not started yet.
          </Text>
        </Center>
      )}
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg">
        {data.doctors.map((d) => (
          <Box key={d.doctorId} bg="dark.6" p="lg" style={{ borderRadius: 16, borderTop: `8px solid var(--mantine-color-${d.color}-5)` }} aria-label={`${d.doctorName} queue`}>
            <Group justify="space-between" align="flex-start">
              <Stack gap={0}>
                <Text fz={26} fw={700}>
                  {d.doctorName}
                </Text>
                <Text fz={18} c="gray.4">
                  {d.departmentName}
                </Text>
              </Stack>
              {d.room && (
                <Text fz={22} fw={700} c={`${d.color}.3`}>
                  {d.room}
                </Text>
              )}
            </Group>
            <Group align="flex-end" justify="space-between" mt="md">
              <Stack gap={0}>
                <Text fz={16} c="gray.4" tt="uppercase">
                  Now serving
                </Text>
                <Text fz={96} fw={800} lh={1} c={d.nowServing ? 'white' : 'dark.3'} aria-label={`Now serving ${d.nowServing ?? 'none'}`}>
                  {d.nowServing ?? '—'}
                </Text>
              </Stack>
              <Stack gap={4} align="flex-end">
                <Text fz={16} c="gray.4" tt="uppercase">
                  Next
                </Text>
                <Group gap="xs">
                  {d.next.length ? (
                    d.next.map((t) => (
                      <Text key={t} fz={36} fw={700} px="sm" bg="dark.4" style={{ borderRadius: 8 }}>
                        {t}
                      </Text>
                    ))
                  ) : (
                    <Text fz={28} c="dark.3">
                      —
                    </Text>
                  )}
                </Group>
                <Text fz={14} c="gray.5">
                  {d.waiting} waiting
                </Text>
              </Stack>
            </Group>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  )
}
