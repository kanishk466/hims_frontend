import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { listBills } from '@/api/billing'
import { listVisits } from '@/api/visits'
import { AppProviders } from '@/app/providers'
import { createQueryClient } from '@/app/queryClient'
import { loginAs, renderRoute, renderWithProviders } from '@/test/utils'
import type { RxItem } from '@/types/opd'
import { RxEditor } from './workbench/RxEditor'

const visitOf = async (name: string) => (await listVisits()).find((v) => v.patient.name === name)!

describe('doctor workbench (UI)', () => {
  it('shows the doctor’s own queue and the patient in the room', async () => {
    await loginAs('doctor')
    renderRoute('/opd/workbench')
    expect(await screen.findByRole('button', { name: 'Open consultation' })).toBeInTheDocument()
    expect(screen.getByText(/Waiting \(\d+\)/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Doctor' })).not.toBeInTheDocument()
  })

  it('will not complete without a diagnosis, then completes and goes to the prescription', async () => {
    await loginAs('doctor')
    const v = (await listVisits({ doctorId: 'doc-vikram' })).find((x) => x.status === 'inConsultation')!
    const { router } = renderRoute(`/opd/workbench/${v.id}`)
    const complete = await screen.findByRole('button', { name: 'Complete & print' })
    await userEvent.click(complete)
    expect(await screen.findByText('Add at least one diagnosis')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Templates' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Viral fever \(adult\)/ }))
    expect(await screen.findByText('Dolo 650')).toBeInTheDocument()
    expect(screen.getByText('B34.9')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Complete & print' }))
    await screen.findByText(/Signed electronically/)
    expect(router.state.location.pathname).toBe(`/print/rx/${v.id}`)
    expect(screen.getByText('PARACETAMOL')).toBeInTheDocument()
    expect(screen.getByText(/दिन में तीन बार/)).toBeInTheDocument()
  })

  it('adds a drug with defaults, works out the quantity and warns about an allergy', async () => {
    await loginAs('doctor')
    let rx: RxItem[] = []
    const { rerender } = renderWithProviders(<RxEditor value={rx} onChange={(x) => (rx = x)} allergies={['PEN']} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Add drug' }), 'augmentin')
    await userEvent.click(await screen.findByText('Augmentin 625 Duo'))
    await waitFor(() => expect(rx).toHaveLength(1))
    expect(rx[0]).toMatchObject({ frequency: 'BD', timing: 'AF', duration: 5, qty: 10 })
    rerender(<AppProviders client={createQueryClient()}><RxEditor value={rx} onChange={(x) => (rx = x)} allergies={['PEN']} /></AppProviders>)
    expect(await screen.findByText(/patient is allergic \(PEN\)/)).toBeInTheDocument()
  })
})

describe('prints (UI)', () => {
  it('prints a receipt with the amount in words and switches to thermal', async () => {
    await loginAs('cashier')
    const paid = (await listBills()).rows.find((b) => b.status === 'paid' && b.paidPaise > 0)!
    renderRoute(`/print/receipt/${paid.id}?size=a5`)
    expect(await screen.findByText('OPD BILL CUM RECEIPT')).toBeInTheDocument()
    expect(screen.getByText(/^Rupees .* Only$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '80 mm' }))
    expect(screen.getByRole('button', { name: '80 mm' })).toHaveAttribute('data-variant', 'filled')
  })

  it('prints the token slip without the app menu', async () => {
    await loginAs('frontOffice')
    const v = await visitOf('Rajendra Wagh')
    renderRoute(`/print/slip/${v.id}`)
    expect(await screen.findByText('TOKEN')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).not.toBeInTheDocument()
  })

  it('front office cannot open a prescription print', async () => {
    await loginAs('frontOffice')
    const v = await visitOf('Kavita Pawar')
    renderRoute(`/print/rx/${v.id}`)
    expect(await screen.findByText(/have access to this page/)).toBeInTheDocument()
  })

  it('cashier cannot open the workbench', async () => {
    await loginAs('cashier')
    const v = await visitOf('Kavita Pawar')
    renderRoute(`/opd/workbench/${v.id}`)
    expect(await screen.findByText(/have access to this page/)).toBeInTheDocument()
  })
})
