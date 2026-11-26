import { Box, Button, Center, Group, Loader, Text } from '@mantine/core'
import { IconArrowLeft, IconPrinter, IconX } from '@tabler/icons-react'
import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { PAGE_SIZES, type PageSize } from './pageSizes'
import './print.css'

/** Bare signed-in layout for full-screen pages (TV) and prints: no sidebar or top bar. */
export function BareLayout() {
  const { token, data, isPending, isError } = useSession()
  const location = useLocation()
  if (!token || isError) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (isPending || !data)
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  return <Outlet />
}

interface Props {
  title: string
  size: PageSize
  /** Other sizes the user may switch to (adds a toggle to the toolbar). */
  sizes?: PageSize[]
  ready: boolean
  error?: string
  children: ReactNode
}

const SIZE_LABEL: Record<PageSize, string> = {
  thermal: '80 mm',
  a5: 'A5',
  a4: 'A4',
  card: 'Card',
}

/**
 * A printable sheet with a toolbar that is hidden on paper. `?autoprint=1` opens the
 * print dialog as soon as the data is in; `?back=/path` adds a Back button.
 */
export function PrintSheet({ title, size, sizes, ready, error, children }: Props) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const back = params.get('back')
  const s = PAGE_SIZES[size]
  const auto = params.get('autoprint') === '1'

  useEffect(() => {
    document.title = title
  }, [title])
  useEffect(() => {
    if (!ready || !auto) return
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [ready, auto])

  return (
    <Box className="print-bg" bg="gray.1" mih="100vh" pb="xl">
      <style>{`@page { size: ${s.page}; margin: ${s.margin}; }`}</style>
      <Group className="no-print" justify="space-between" p="sm" bg="white" mb="lg" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Group gap="xs">
          {back ? (
            <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate(back)}>
              Back
            </Button>
          ) : (
            <Button variant="subtle" color="gray" leftSection={<IconX size={16} />} onClick={() => window.close()}>
              Close
            </Button>
          )}
          <Text fw={600}>{title}</Text>
        </Group>
        <Group gap="xs">
          {sizes?.map((x) => (
            <Button
              key={x}
              size="compact-sm"
              variant={x === size ? 'filled' : 'default'}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('size', x)
                next.delete('autoprint')
                setParams(next, { replace: true })
              }}
            >
              {SIZE_LABEL[x]}
            </Button>
          ))}
          <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()} disabled={!ready} autoFocus>
            Print
          </Button>
        </Group>
      </Group>
      {error ? (
        <Center>
          <Text c="red">{error}</Text>
        </Center>
      ) : !ready ? (
        <Center>
          <Loader />
        </Center>
      ) : (
        <div className="print-sheet" style={{ width: s.width, padding: s.padding }}>
          {children}
        </div>
      )}
    </Box>
  )
}
