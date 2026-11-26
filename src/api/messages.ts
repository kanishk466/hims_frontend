/**
 * SMS/WhatsApp, fully simulated (Integrations step): no message ever leaves the browser.
 * A "send" renders the clinic's template and writes it to the audit log as a record of
 * what would have gone out, to whom, and when.
 */
import type { MessageEvent, MessageTemplates } from '@/types/clinic'
import { request } from './client'

export function getMessageTemplates(): Promise<MessageTemplates> {
  return request('/admin/setup/messages')
}

export function updateMessageTemplates(input: MessageTemplates): Promise<MessageTemplates> {
  return request('/admin/setup/messages', { method: 'PATCH', body: input })
}

export interface SendMessageInput {
  channel: 'sms' | 'whatsapp'
  event: MessageEvent
  patientId: string
  /** Values for this template's placeholders, e.g. { billNo: 'B-001', amount: '500' }. */
  vars: Record<string, string>
}

export interface SendMessageResult {
  to: string
  channel: 'sms' | 'whatsapp'
  body: string
  sentAt: string
}

/** Simulated send: logs it to the audit trail (visible to Admin/MD) and returns the text shown to the staff member. */
export function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  return request('/admin/setup/messages/send', { method: 'POST', body: input })
}
