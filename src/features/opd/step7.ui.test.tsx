import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { loginAs, renderRoute } from '@/test/utils'

describe('emergency screen (UI)', () => {
  it('registers an unknown MLC patient and shows the E-token', async () => {
    await loginAs('frontOffice')
    renderRoute('/opd/emergency')
    await screen.findByText('Quick registration')
    await userEvent.click(screen.getByRole('radio', { name: 'Male' }))
    await userEvent.type(screen.getByLabelText(/Approximate age/), '30')
    await userEvent.click(screen.getByRole('switch', { name: /Medico-legal case/ }))
    await userEvent.click(screen.getByRole('button', { name: /Register and send to casualty/ }))
    expect(await screen.findByText('Enter the police station')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Police station/), 'Kothrud')
    await userEvent.type(screen.getByLabelText(/MLC number/), 'MLC/26/55')
    await userEvent.click(screen.getByRole('button', { name: /Register and send to casualty/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Sent to casualty' })
    expect(within(dialog).getByText(/^E\d+$/)).toBeInTheDocument()
    expect(within(dialog).getByText('MLC')).toBeInTheDocument()
  })

  it('nurse sees the screen but cannot identify patients', async () => {
    await loginAs('nurse')
    renderRoute('/opd/emergency')
    await screen.findByText(/To identify/)
    expect(screen.queryByRole('button', { name: 'Identify' })).not.toBeInTheDocument()
  })
})

describe('day-end screen (UI)', () => {
  it('cashier sees only My counter', async () => {
    await loginAs('cashier')
    renderRoute('/opd/day-end')
    expect(await screen.findByRole('tab', { name: 'My counter' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Day-end \(all/ })).not.toBeInTheDocument()
  })

  it('Accounts sees the day view with Close the day', async () => {
    await loginAs('accounts')
    renderRoute('/opd/day-end')
    expect(await screen.findByRole('button', { name: 'Close the day' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'My counter' })).not.toBeInTheDocument()
  })
})

describe('reports (UI)', () => {
  it('lists only the reports the role may see', async () => {
    await loginAs('accounts')
    renderRoute('/reports')
    expect(await screen.findByText('Collection by mode and cashier')).toBeInTheDocument()
    expect(screen.queryByText('Top diagnoses')).not.toBeInTheDocument()
  })

  it('runs a report with tiles and a table, filtered by period', async () => {
    await loginAs('md')
    renderRoute('/reports/footfall?range=last30')
    expect(await screen.findByText('Patients', { selector: 'p' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(3))
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument()
  })

  it('a report the role lacks shows the no-access page', async () => {
    await loginAs('accounts')
    renderRoute('/reports/diagnoses')
    expect(await screen.findByText(/have access to this page/)).toBeInTheDocument()
  })

  it('MD sees the hospital-today dashboard', async () => {
    await loginAs('md')
    renderRoute('/dashboard')
    expect(await screen.findByText('Hospital today')).toBeInTheDocument()
  })

  it('front office does not see the MD dashboard', async () => {
    await loginAs('frontOffice')
    renderRoute('/dashboard')
    await screen.findByText('Your access')
    expect(screen.queryByText('Hospital today')).not.toBeInTheDocument()
  })
})
