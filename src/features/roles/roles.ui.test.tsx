import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { loginAs, renderRoute } from '@/test/utils'

describe('roles page (UI)', () => {
  it('ticking Cancel on billing also ticks View, and saving clears the save bar', async () => {
    await loginAs('admin')
    renderRoute('/admin/roles?role=role-sunrise-nurse')
    const cancel = await screen.findByRole('checkbox', { name: 'OPD › Billing counter › Cancel' })
    const view = screen.getByRole('checkbox', { name: 'OPD › Billing counter › View' })
    expect(view).not.toBeChecked()
    await userEvent.click(cancel)
    expect(view).toBeChecked()
    const bar = screen.getByRole('region', { name: 'Unsaved changes' })
    expect(bar).toHaveTextContent('2 permission changes')
    await userEvent.click(within(bar).getByRole('button', { name: /Save changes/ }))
    expect(await screen.findByRole('checkbox', { name: 'OPD › Billing counter › Cancel' })).toBeChecked()
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument()
  })

  it('locks the Clinic Admin grid', async () => {
    await loginAs('admin')
    renderRoute('/admin/roles?role=role-sunrise-admin')
    expect(await screen.findByRole('checkbox', { name: 'OPD › Billing counter › Cancel' })).toBeDisabled()
    expect(screen.getByText(/always has full access/)).toBeInTheDocument()
  })
})

describe('See as this user (UI)', () => {
  it('shows the nurse’s menu under a banner, and goes back', async () => {
    await loginAs('admin')
    renderRoute('/admin/users')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Sneha Gaikwad' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'See as this user' }))
    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('You are seeing the app as Sneha Gaikwad')
    const nav = screen.getByRole('navigation', { name: 'Main menu' })
    expect(nav).toHaveTextContent('Vitals')
    expect(nav).not.toHaveTextContent('Users')
    await userEvent.click(within(banner).getByRole('button', { name: 'Back to Sanjay Kulkarni' }))
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
