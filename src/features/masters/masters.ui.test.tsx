import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { loginAs, renderRoute } from '@/test/utils'

describe('masters (UI)', () => {
  it('price check shows the price and the winning rule', async () => {
    await loginAs('admin')
    renderRoute('/masters/services?tab=price')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Service' }))
    await userEvent.click(await screen.findByRole('option', { name: 'CBC – Complete blood count (CBC)' }))
    expect(await screen.findByLabelText('Price')).toHaveTextContent('₹350.00')
    await userEvent.click(screen.getByRole('combobox', { name: 'Patient category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Senior citizen' }))
    expect(await screen.findByLabelText('Price')).toHaveTextContent('₹300.00')
    expect(screen.getByText(/Rate for this patient category/)).toBeInTheDocument()
  })

  it('the cashier sees services and tariffs but cannot add a service or approve', async () => {
    await loginAs('cashier')
    renderRoute('/masters/services')
    expect(await screen.findByText('OPD consultation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add service' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
  })

  it('pending rates are listed first with an approval prompt for Accounts', async () => {
    await loginAs('admin')
    renderRoute('/masters/services?tab=tariffs')
    expect(await screen.findByText('1 rate waiting for your approval')).toBeInTheDocument()
    expect(screen.getAllByText('Pending')[0]).toBeInTheDocument()
  })

  it('value lists: adds a frequency with its doses per day', async () => {
    await loginAs('admin')
    renderRoute('/masters/value-lists?list=frequency')
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/Label/), 'Every 6 hours')
    expect(within(dialog).getByLabelText(/Code/)).toHaveValue('EVERY-6-HOURS')
    await userEvent.clear(within(dialog).getByLabelText('Doses per day'))
    await userEvent.type(within(dialog).getByLabelText('Doses per day'), '4')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const row = (await screen.findByText('Every 6 hours')).closest('tr')!
    expect(row).toHaveTextContent('4')
  })

  it('drugs: search by generic finds the brands', async () => {
    await loginAs('doctor')
    renderRoute('/masters/drugs')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Search drugs' }), 'metformin')
    expect(await screen.findByText('Glycomet 500')).toBeInTheDocument()
    expect(screen.queryByText('Dolo 650')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add drug' })).not.toBeInTheDocument()
  })
})
