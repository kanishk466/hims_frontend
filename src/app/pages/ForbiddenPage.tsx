import { Button, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'
import { Link } from 'react-router-dom'

export function ForbiddenPage() {
  return (
    <Center mih="60vh">
      <Stack align="center" gap="sm" maw={420} ta="center">
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          <IconLock size={30} />
        </ThemeIcon>
        <Title order={3}>You don't have access to this page</Title>
        <Text c="dimmed">Ask your hospital administrator to add this screen to your role.</Text>
        <Button component={Link} to="/" variant="light">
          Go to my home page
        </Button>
      </Stack>
    </Center>
  )
}
