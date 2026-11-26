/** Versioned tariffs, approval and the price check (Onboarding & Masters → Versioned tariffs). */
import type { PriceQuery, PriceResult } from '@/lib/pricing'
import type { TariffInput, TariffRow } from '@/types/masters'
import { request } from './client'

export interface TariffQuery {
  serviceId?: string
  payerId?: string
  doctorId?: string
  /** Also show superseded and cancelled versions. */
  history?: boolean
}

export function listTariffs(q: TariffQuery = {}): Promise<TariffRow[]> {
  const params = new URLSearchParams()
  if (q.serviceId) params.set('serviceId', q.serviceId)
  if (q.payerId) params.set('payerId', q.payerId)
  if (q.doctorId) params.set('doctorId', q.doctorId)
  if (q.history) params.set('history', 'true')
  const qs = params.toString()
  return request(`/masters/tariffs${qs ? `?${qs}` : ''}`)
}

/**
 * Add a rate (a new version if the combination exists). Users with Approve on tariffs
 * create approved rates; others create pending rates that Accounts approves.
 */
export function createTariff(input: TariffInput): Promise<TariffRow> {
  return request('/masters/tariffs', { method: 'POST', body: input })
}

export function approveTariff(id: string): Promise<TariffRow> {
  return request(`/masters/tariffs/${id}/approve`, { method: 'POST' })
}

/** Cancel a pending or future rate. Current and past rates are changed by adding a new version. */
export async function cancelTariff(id: string, reason: string): Promise<void> {
  await request(`/masters/tariffs/${id}/cancel`, { method: 'POST', body: { reason } })
}

export interface PriceCheck extends PriceResult {
  serviceName: string
  defaultRatePaise: number
  /** Every approved row that could apply, most specific first, for the explanation table. */
  candidates: TariffRow[]
}

/** The price billing will charge, with the reason. Used by the price check screen and (step 5) billing. */
export function checkPrice(q: PriceQuery): Promise<PriceCheck> {
  const params = new URLSearchParams({ serviceId: q.serviceId, date: q.date })
  if (q.doctorId) params.set('doctorId', q.doctorId)
  if (q.visitType) params.set('visitType', q.visitType)
  if (q.payerId) params.set('payerId', q.payerId)
  if (q.patientCategory) params.set('patientCategory', q.patientCategory)
  return request(`/masters/tariffs/price-check?${params.toString()}`)
}
