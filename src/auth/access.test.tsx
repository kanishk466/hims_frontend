import { useSessionStore } from '@/auth/sessionStore'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { loginAs, renderRoute, renderWithProviders } from '@/test/utils'
import { Can } from './Can'
import { useSession } from './queries'

function Probe() {
  const { data } = useSession()
  if (!data) return <p>loading</p>
  return (
    <>
      <p>ready</p>
      <Can permission="opd.billing.create">
        <button>New bill</button>
      </Can>
      <Can permission="opd.billing.cancel">
        <button>Cancel bill</button>
      </Can>
    </>
  )
}

describe('<Can>', () => {
  it('hides buttons the user has no permission for', async () => {
    await loginAs('cashier')
    renderWithProviders(<Probe />)
    await screen.findByText('ready')
    expect(screen.getByRole('button', { name: 'New bill' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel bill' })).not.toBeInTheDocument()
  })
})

describe('menu and routes', () => {
  it('shows only permitted menu items', async () => {
    await loginAs('nurse')
    renderRoute('/dashboard')
    const nav = await screen.findByRole('navigation', { name: 'Main menu' })
    expect(nav).toHaveTextContent('Vitals')
    expect(nav).toHaveTextContent('Queue')
    expect(nav).not.toHaveTextContent('Billing')
    expect(nav).not.toHaveTextContent('Masters')
  })

  it('shows the 403 page for a route without "view" permission', async () => {
    await loginAs('cashier')
    renderRoute('/admin/users')
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
  })

  it('sends a super-admin to Clinics', async () => {
    await loginAs('superAdmin')
    const { router } = renderRoute('/')
    await screen.findByRole('button', { name: 'Create clinic' })
    expect(router.state.location.pathname).toBe('/platform/clinics')
  })

  it('redirects to sign-in without a session, and comes back after signing in', async () => {
    useSessionStore.getState().clear()
    const { router } = renderRoute('/opd/billing')
    await userEvent.type(await screen.findByLabelText('Username or mobile number'), 'amit.joshi')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-one')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Wrong username or password.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    await userEvent.clear(screen.getByLabelText('Password'))
    await userEvent.type(screen.getByLabelText('Password'), 'demo@123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Billing counter' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/opd/billing')
  })

  it('opens the demo picker from the sign-in page', async () => {
    useSessionStore.getState().clear()
    renderRoute('/login')
    await userEvent.click(await screen.findByRole('link', { name: /Pick a demo user/ }))
    expect(await screen.findByText('Choose a demo user')).toBeInTheDocument()
  })
})
