import { describe, expect, it } from 'vitest'
import { addDays, todayIST } from '@/lib/dates'
import { loginAs } from '@/test/utils'
import { createClinic } from './platform'
import { listDrugs } from './drugs'
import { updateDoctor, listDoctors } from './doctors'
import { createLeave } from './leaves'
import { createService, listServices, setServiceActive } from './services'
import { approveTariff, cancelTariff, checkPrice, createTariff, listTariffs } from './tariffs'
import { createValueListItem, listValueList, setValueListItemActive, updateValueListItem } from './valueLists'

const today = todayIST()
const CONS = 'svc-clinic-sunrise-cons'

describe('provisioning seeds masters', () => {
  it('gives a new clinic value lists, services and drugs', async () => {
    await loginAs('superAdmin')
    const r = await createClinic({ name: 'Om Sai Clinic', code: 'omsai', city: 'Satara', state: 'Maharashtra', plan: 'trial', beds: 10, adminName: 'Vaibhav Shinde', adminMobile: '9988776655', adminEmail: 'v@omsai.in' })
    expect(r.steps.map((s) => s.label)).toContain('Starter masters')
  })

  it('Sunrise has 63 drugs, searchable by brand or generic', async () => {
    await loginAs('admin')
    expect((await listDrugs()).total).toBe(63)
    const para = await listDrugs({ q: 'paracetamol' })
    expect(para.items.map((d) => d.brand)).toContain('Dolo 650')
    expect((await listDrugs({ q: 'dolo' })).items[0]!.brand).toBe('Dolo 650')
  })
})

describe('doctor fees ↔ consultation tariffs', () => {
  it('a fee change adds a new version from today and keeps the old one', async () => {
    await loginAs('admin')
    const before = await checkPrice({ serviceId: CONS, doctorId: 'doc-vikram', visitType: 'new', date: today })
    expect(before.amountPaise).toBe(50000)
    const d = (await listDoctors()).find((x) => x.id === 'doc-vikram')!
    await updateDoctor(d.id, { ...d, mobile: d.mobile ?? '', feeNewPaise: 60000 })
    expect((await checkPrice({ serviceId: CONS, doctorId: 'doc-vikram', visitType: 'new', date: today })).amountPaise).toBe(60000)
    expect((await checkPrice({ serviceId: CONS, doctorId: 'doc-vikram', visitType: 'new', date: addDays(today, -1) })).amountPaise).toBe(50000)
    const history = await listTariffs({ serviceId: CONS, doctorId: 'doc-vikram', history: true })
    expect(history.filter((t) => t.visitTypeLabel === 'New visit').map((t) => t.amountPaise)).toEqual([60000, 50000, 40000])
  })

  it('price check explains panel and category rates', async () => {
    await loginAs('admin')
    const cghs = await checkPrice({ serviceId: CONS, doctorId: 'doc-vikram', visitType: 'new', payerId: 'panel-cghs', date: today })
    // Doctor-specific cash rate (8) outranks the CGHS rate (4+2): a deliberate rule from the spec.
    expect(cghs.amountPaise).toBe(50000)
    const tpa = await checkPrice({ serviceId: 'svc-clinic-sunrise-cbc', payerId: 'panel-mediassist', date: today })
    expect(tpa).toMatchObject({ amountPaise: 31500, source: 'panelAdjusted' })
    const senior = await checkPrice({ serviceId: 'svc-clinic-sunrise-cbc', patientCategory: 'senior', date: today })
    expect(senior.amountPaise).toBe(30000)
  })
})

describe('tariff approval', () => {
  it('a rate from someone without Approve stays pending until Accounts approves', async () => {
    await loginAs('admin')
    const pending = (await listTariffs()).find((t) => t.status === 'pending')!
    expect(pending.serviceCode).toBe('USG-ABD')
    expect((await checkPrice({ serviceId: pending.serviceId, date: addDays(today, 2) })).amountPaise).toBe(120000)
    await approveTariff(pending.id)
    expect((await checkPrice({ serviceId: pending.serviceId, date: addDays(today, 2) })).amountPaise).toBe(140000)
  })

  it('cannot cancel a rate already in use; can cancel a future one', async () => {
    await loginAs('admin')
    const rows = await listTariffs({ serviceId: 'svc-clinic-sunrise-ecg' })
    const current = rows.find((r) => r.period === 'current')!
    const future = rows.find((r) => r.period === 'future')!
    await expect(cancelTariff(current.id, 'test')).rejects.toMatchObject({ code: 'in_effect' })
    await cancelTariff(future.id, 'Rate card postponed')
    expect((await listTariffs({ serviceId: 'svc-clinic-sunrise-ecg' })).some((r) => r.id === future.id)).toBe(false)
  })

  it('rejects two rates for the same combination starting the same day', async () => {
    await loginAs('admin')
    const input = { serviceId: 'svc-clinic-sunrise-neb', doctorId: null, visitType: null, payerId: null, patientCategory: null, amountPaise: 25000, validFrom: addDays(today, 5) }
    await createTariff(input)
    await expect(createTariff(input)).rejects.toMatchObject({ status: 409 })
  })
})

describe('masters rules', () => {
  it('protects the consultation service and services inside packages', async () => {
    await loginAs('admin')
    await expect(setServiceActive(CONS, false)).rejects.toMatchObject({ code: 'locked' })
    await expect(setServiceActive('svc-clinic-sunrise-cbc', false)).rejects.toMatchObject({ code: 'in_use' })
    await expect(createService({ code: 'ECG', name: 'Dup', group: 'procedure', defaultRatePaise: 0, gstPercent: 0, openPrice: false })).rejects.toMatchObject({ status: 409 })
    expect((await listServices()).find((s) => s.code === 'PKG-BASIC')?.includedServiceIds).toHaveLength(6)
  })

  it('locked value list items keep their code and cannot be deactivated', async () => {
    await loginAs('admin')
    const cash = (await listValueList('paymentMode')).find((v) => v.code === 'cash')!
    await expect(setValueListItemActive(cash.id, false)).rejects.toMatchObject({ code: 'locked' })
    await expect(updateValueListItem(cash.id, { ...cash, code: 'CASH2' })).rejects.toMatchObject({ code: 'locked' })
    const renamed = await updateValueListItem(cash.id, { ...cash, label: 'Cash (₹)' })
    expect(renamed.label).toBe('Cash (₹)')
    const item = await createValueListItem('frequency', { code: 'Q6H', label: 'Every 6 hours', meta: { perDay: '4' } })
    expect(item.meta).toEqual({ perDay: 4 })
  })

  it('rejects overlapping leave for the same doctor', async () => {
    await loginAs('admin')
    await expect(createLeave({ doctorId: 'doc-farah', from: addDays(today, 4), to: addDays(today, 6), reason: 'Personal' })).rejects.toMatchObject({ code: 'overlap' })
    await createLeave({ doctorId: 'doc-vikram', from: addDays(today, 4), to: addDays(today, 4), reason: 'Personal' })
  })
})
