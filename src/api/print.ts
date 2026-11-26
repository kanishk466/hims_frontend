/** Letterhead for printed slips, cards and receipts; print & branding setup (wizard step 7). */
import type { ClinicProfile, PrintSettings } from '@/types/clinic'
import { request } from './client'

export type Letterhead = Pick<ClinicProfile, 'name' | 'legalName' | 'addressLine' | 'city' | 'state' | 'pinCode' | 'phone' | 'email' | 'gstin' | 'registrationNo' | 'logoDataUrl' | 'website'> & {
  printSettings: PrintSettings
}

/** Any signed-in clinic user may print with the clinic's letterhead. */
export function getLetterhead(): Promise<Letterhead> {
  return request('/admin/setup/letterhead')
}

export function getPrintSettings(): Promise<PrintSettings & { configuredAt?: string }> {
  return request('/admin/setup/print')
}

export function updatePrintSettings(input: PrintSettings): Promise<PrintSettings> {
  return request('/admin/setup/print', { method: 'PATCH', body: input })
}
