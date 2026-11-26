/**
 * HTTP-shaped twin of the old mock logic in src/api/setup.ts, print.ts, integrations.ts and
 * messages.ts (Stage 6e) — all four live under the real backend's single /admin/setup/*
 * controller, so their MSW handlers are combined here the same way.
 */
import { http, type HttpHandler } from 'msw'
import { clinicProfileSchema, integrationSettingsSchema, messageTemplatesSchema, printSettingsSchema, type IntegrationSettings, type MessageEvent } from '@/types/clinic'
import { ApiError } from '@/api/client'
import { computeSetupProgress } from '@/api/_setup'
import { findInClinic, notFound, nowIso, requireClinic, requirePermission, validate, writeAudit } from '@/api/_server'
import { authenticateFromRequest, respond, url } from './common.js'

function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
}

export const setupHandlers: HttpHandler[] = [
  http.get(url('/admin/setup/progress'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.view')
      return computeSetupProgress(ctx.db, requireClinic(ctx))
    }),
  ),

  http.get(url('/admin/setup/profile'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, ['admin.setup.view', 'home.dashboard.view'])
      const id = requireClinic(ctx)
      return ctx.db.clinics.find((c) => c.id === id) ?? notFound('Clinic')
    }),
  ),

  http.patch(url('/admin/setup/profile'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.edit')
      const data = validate(clinicProfileSchema, raw)
      if (data.logoDataUrl && data.logoDataUrl.length > 400_000) {
        throw new ApiError(400, 'invalid', 'The logo is too large.', { logoDataUrl: 'Use an image under 300 KB' })
      }
      const id = requireClinic(ctx)
      const clinic = ctx.db.clinics.find((c) => c.id === id) ?? notFound('Clinic')
      const before = { ...clinic, logoDataUrl: clinic.logoDataUrl ? '(image)' : undefined }
      Object.assign(clinic, data)
      writeAudit(ctx, { action: 'edit', entity: 'clinic', entityId: id, summary: 'Updated hospital profile', before, after: { ...data, logoDataUrl: data.logoDataUrl ? '(image)' : undefined } })
      return clinic
    })
  }),

  http.post(url('/admin/setup/services/reviewed'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.edit')
      const id = requireClinic(ctx)
      const clinic = ctx.db.clinics.find((c) => c.id === id)!
      clinic.servicesReviewedAt ??= nowIso()
      return { ok: true }
    }),
  ),

  http.post(url('/admin/setup/complete'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.edit')
      const id = requireClinic(ctx)
      const progress = computeSetupProgress(ctx.db, id)
      if (!progress.complete) throw new ApiError(400, 'setup_incomplete', 'Finish the required steps first.')
      const clinic = ctx.db.clinics.find((c) => c.id === id)!
      if (!clinic.setupCompletedAt) {
        clinic.setupCompletedAt = nowIso()
        writeAudit(ctx, { action: 'edit', entity: 'clinic', entityId: id, summary: 'Completed clinic setup' })
      }
      return progress
    }),
  ),

  http.get(url('/admin/setup/print'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.view')
      const c = ctx.db.clinics.find((x) => x.id === requireClinic(ctx))!
      return { ...c.printSettings, configuredAt: c.printConfiguredAt }
    }),
  ),

  http.patch(url('/admin/setup/print'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.edit')
      const data = validate(printSettingsSchema, raw)
      const c = ctx.db.clinics.find((x) => x.id === requireClinic(ctx))!
      c.printSettings = { ...data, footerNote: data.footerNote ?? '' }
      c.printConfiguredAt ??= nowIso()
      writeAudit(ctx, { action: 'edit', entity: 'clinic', entityId: c.id, summary: `Updated print & branding settings (${data.paperSize})` })
      return c.printSettings
    })
  }),

  http.get(url('/admin/setup/integrations'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.view')
      const c = ctx.db.clinics.find((x) => x.id === requireClinic(ctx))!
      return { ...c.integrations, configuredAt: c.integrationsConfiguredAt }
    }),
  ),

  http.patch(url('/admin/setup/integrations'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.edit')
      const data = validate(integrationSettingsSchema, raw)
      const c = ctx.db.clinics.find((x) => x.id === requireClinic(ctx))!
      const before = c.integrations
      c.integrations = data
      c.integrationsConfiguredAt ??= nowIso()
      const changed = (Object.keys(data) as (keyof IntegrationSettings)[]).filter((k) => data[k] !== before[k])
      writeAudit(ctx, { action: 'edit', entity: 'clinic', entityId: c.id, summary: `Updated integration settings${changed.length ? `: ${changed.join(', ')}` : ''}` })
      return c.integrations
    })
  }),

  http.get(url('/admin/setup/messages'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.view')
      return ctx.db.clinics.find((c) => c.id === requireClinic(ctx))!.messageTemplates
    }),
  ),

  http.patch(url('/admin/setup/messages'), async ({ request }) => {
    const raw = await request.json()
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      requirePermission(ctx, 'admin.setup.edit')
      const data = validate(messageTemplatesSchema, raw)
      const c = ctx.db.clinics.find((x) => x.id === requireClinic(ctx))!
      c.messageTemplates = data
      writeAudit(ctx, { action: 'edit', entity: 'clinic', entityId: c.id, summary: 'Updated SMS/WhatsApp templates' })
      return c.messageTemplates
    })
  }),

  // No permission check: any authenticated clinic user may send a message.
  http.post(url('/admin/setup/messages/send'), async ({ request }) => {
    const input = (await request.json()) as { channel: 'sms' | 'whatsapp'; event: MessageEvent; patientId: string; vars: Record<string, string> }
    return respond(() => {
      const ctx = authenticateFromRequest(request)
      const clinicId = requireClinic(ctx)
      const clinic = ctx.db.clinics.find((c) => c.id === clinicId)!
      const enabled = input.channel === 'sms' ? clinic.integrations.smsEnabled : clinic.integrations.whatsappEnabled
      if (!enabled) throw new ApiError(409, 'disabled', `Turn on ${input.channel === 'sms' ? 'SMS' : 'WhatsApp'} in Clinic setup → Integrations first.`)
      const patient = findInClinic(ctx.db.patients, ctx, input.patientId, 'Patient')
      const body = render(clinic.messageTemplates[input.event], { patientName: patient.name, clinicName: clinic.name, ...input.vars })
      const at = nowIso()
      writeAudit(ctx, {
        action: 'create',
        entity: 'message',
        entityId: patient.id,
        summary: `${input.channel === 'sms' ? 'SMS' : 'WhatsApp'} to ${patient.name} (${patient.mobile}), simulated: “${body}”`,
      })
      return { to: patient.mobile, channel: input.channel, body, sentAt: at }
    })
  }),

  // No permission check: any signed-in clinic user may print with the clinic's letterhead.
  http.get(url('/admin/setup/letterhead'), ({ request }) =>
    respond(() => {
      const ctx = authenticateFromRequest(request)
      const id = requireClinic(ctx)
      const c = ctx.db.clinics.find((x) => x.id === id)!
      return {
        name: c.name,
        legalName: c.legalName,
        addressLine: c.addressLine,
        city: c.city,
        state: c.state,
        pinCode: c.pinCode,
        phone: c.phone,
        email: c.email,
        gstin: c.gstin,
        registrationNo: c.registrationNo,
        logoDataUrl: c.logoDataUrl,
        website: c.website,
        printSettings: c.printSettings,
      }
    }),
  ),
]
