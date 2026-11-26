/**
 * Integrations setup (wizard step 8): ABDM/ABHA, SMS/WhatsApp and UPI toggles. Everything
 * here is simulated — no real gateway or health-registry call ever leaves the browser.
 */
import type { IntegrationSettings } from '@/types/clinic'
import { request } from './client'

export function getIntegrationSettings(): Promise<IntegrationSettings & { configuredAt?: string }> {
  return request('/admin/setup/integrations')
}

export function updateIntegrationSettings(input: IntegrationSettings): Promise<IntegrationSettings> {
  return request('/admin/setup/integrations', { method: 'PATCH', body: input })
}
