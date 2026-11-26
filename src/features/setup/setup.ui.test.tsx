import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SEED_IDS } from '@/mock/seed'
import { loginAs, loginAsUser, renderRoute } from '@/test/utils'

describe('setup wizard (UI)', () => {
  it('sends a new clinic’s admin straight to the wizard and saves department ticks', async () => {
    await loginAsUser(SEED_IDS.lotusAdmin)
    const { router } = renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Hospital profile' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/setup')

    const nav = screen.getByRole('navigation', { name: 'Setup steps' })
    expect(screen.getByText('0 of 5')).toBeInTheDocument()
    await userEvent.click(within(nav).getByText('Departments'))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Paediatrics' }))
    expect(await screen.findByText('1 selected')).toBeInTheDocument()
    expect(await within(nav).findByText('1 active')).toBeInTheDocument()
  })

  it('shows the checklist on the dashboard until setup is done', async () => {
    await loginAsUser(SEED_IDS.lotusAdmin)
    renderRoute('/dashboard')
    expect(await screen.findByText('Getting started with Lotus Care Clinic')).toBeInTheDocument()
    expect(screen.getByLabelText('Doctors and fees: to do')).toBeInTheDocument()
  })

  it('for a set-up clinic, ticks the setup steps and lists the go-live checks', async () => {
    await loginAs('admin')
    renderRoute('/dashboard')
    expect(await screen.findByLabelText('Doctors and fees: done')).toBeInTheDocument()
    expect(screen.getByLabelText('Run a test patient through OPD: done')).toBeInTheDocument()
    expect(screen.getByLabelText('Check what each role can do: to do')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Looks fine' }))
    expect(await screen.findByLabelText('Check what each role can do: done')).toBeInTheDocument()
  })

  it('hides the card, and the user menu brings it back', async () => {
    await loginAs('admin')
    renderRoute('/dashboard')
    await userEvent.click(await screen.findByRole('button', { name: 'Hide getting started' }))
    await waitFor(() => expect(screen.queryByLabelText('Getting started')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'User menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Getting started' }))
    expect(await screen.findByLabelText('Getting started')).toBeInTheDocument()
  })

  it('starts the tour once for the clinic admin, and not again after it is skipped', async () => {
    await loginAs('admin')
    const { unmount } = renderRoute('/dashboard')
    const dialog = await screen.findByRole('dialog', { name: 'Tour: Welcome' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('dialog', { name: 'Tour: Your menu' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Tour/ })).toBeNull())
    unmount()
    await new Promise((r) => setTimeout(r, 50))
    renderRoute('/dashboard')
    await screen.findByText('Your access')
    await new Promise((r) => setTimeout(r, 900))
    expect(screen.queryByRole('dialog', { name: /^Tour/ })).toBeNull()
  })

  it('does not start the tour for front office', async () => {
    await loginAs('frontOffice')
    renderRoute('/dashboard')
    await screen.findByText('Your access')
    await new Promise((r) => setTimeout(r, 900))
    expect(screen.queryByRole('dialog', { name: /^Tour/ })).toBeNull()
  })
})

describe('create clinic (UI)', () => {
  it('provisions a clinic and shows the invite link', async () => {
    await loginAs('superAdmin')
    const { router } = renderRoute('/platform/clinics')
    await userEvent.click(await screen.findByRole('button', { name: 'Create clinic' }))
    expect(await screen.findByRole('heading', { name: 'Create clinic' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/platform/clinics/new')
    await userEvent.type(screen.getByLabelText(/Clinic or hospital name/), 'Om Sai Clinic')
    expect(screen.getByLabelText(/Clinic code/)).toHaveValue('omsai')
    await userEvent.type(screen.getByLabelText(/^City/), 'Satara')
    await userEvent.type(screen.getByLabelText(/^Full name/), 'Vaibhav Shinde')
    await userEvent.type(screen.getByLabelText(/Mobile number/), '9988776655')
    await userEvent.type(screen.getByLabelText(/^Email/), 'vaibhav@omsai.in')
    await userEvent.click(screen.getByRole('button', { name: 'Create clinic' }))
    expect(await screen.findByText('Om Sai Clinic is ready')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/platform/clinics')
    expect((screen.getByLabelText('Invite link') as HTMLInputElement).value).toContain('/invite/inv_')
  })
})
