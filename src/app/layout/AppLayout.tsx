import { AppShell, Center, Loader } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { EmergencyHotkey } from '@/features/opd/EmergencyButton'
import { Tour } from '@/features/tour/Tour'
import { GlobalSearch } from './GlobalSearch'
import { PreviewBanner } from './PreviewBanner'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Logged-in shell: top bar + permission-filtered sidebar. Redirects to /login without a session. */
export function AppLayout() {
  const { token, data, isPending, isError } = useSession()
  const [opened, { toggle, close }] = useDisclosure()
  const location = useLocation()

  if (!token || isError) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (isPending || !data)
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header>
        <TopBar navOpened={opened} toggleNav={toggle} />
      </AppShell.Header>
      <AppShell.Navbar>
        <Sidebar onNavigate={close} />
      </AppShell.Navbar>
      <AppShell.Main bg="gray.0">
        <PreviewBanner />
        <Outlet />
      </AppShell.Main>
      <GlobalSearch />
      <Tour />
      <EmergencyHotkey />
    </AppShell>
  )
}
