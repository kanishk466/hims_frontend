import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { ReactNode } from 'react'
import { startCrossTabSync } from './crossTabSync'
import { createQueryClient } from './queryClient'
import { theme } from './theme'

const queryClient = createQueryClient()
startCrossTabSync(queryClient)

export function AppProviders({ children, client = queryClient }: { children: ReactNode; client?: QueryClient }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light" env={import.meta.env.MODE === 'test' ? 'test' : 'default'}>
      <QueryClientProvider client={client}>
        <ModalsProvider>
          <Notifications position="bottom-right" limit={3} autoClose={3000} />
          {children}
        </ModalsProvider>
        {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-left" />}
      </QueryClientProvider>
    </MantineProvider>
  )
}
