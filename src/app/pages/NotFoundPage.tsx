import { Button, Center, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <Center mih="60vh">
      <Stack align="center" gap="sm" ta="center">
        <Title order={3}>Page not found</Title>
        <Text c="dimmed">The address may be mistyped, or the page has moved.</Text>
        <Button component={Link} to="/" variant="light">
          Go to my home page
        </Button>
      </Stack>
    </Center>
  )
}
