/**
 * Doctor fees ↔ consultation tariffs (Onboarding & Masters → wizard step 6:
 * "Consultation services (auto-created from step 3)").
 * A doctor's new-visit and follow-up fees are tariff rows on the clinic's CONS service.
 * When a fee changes, a NEW version is added from the given date; old rows stay so
 * old bills reprint exactly.
 */
import type { Doctor, Tariff } from '@/types/masters'
import type { DbShape } from './db'
import { consultationServiceId } from './seed/masters'

export function syncConsultationTariffs(db: DbShape, doctor: Doctor, userId: string, validFrom: string, now = new Date()) {
  const serviceId = consultationServiceId(doctor.clinicId)
  if (!db.services.some((s) => s.id === serviceId)) return
  const fees: [string, number][] = [
    ['new', doctor.feeNewPaise],
    ['followUp', doctor.feeFollowUpPaise],
  ]
  for (const [visitType, amount] of fees) {
    const versions = db.tariffs
      .filter((t) => t.serviceId === serviceId && t.doctorId === doctor.id && t.visitType === visitType && !t.payerId && !t.patientCategory && t.status === 'approved')
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
    const latest = versions[versions.length - 1]
    if (latest?.amountPaise === amount) continue
    // Same-day correction: replace today's version rather than stacking two.
    const sameDay = versions.find((v) => v.validFrom === validFrom)
    if (sameDay) {
      sameDay.status = 'cancelled'
      sameDay.cancelReason = 'Replaced by a fee change the same day'
    }
    const row: Tariff = {
      id: crypto.randomUUID(),
      clinicId: doctor.clinicId,
      serviceId,
      doctorId: doctor.id,
      visitType,
      payerId: null,
      patientCategory: null,
      amountPaise: amount,
      validFrom,
      note: 'From doctor fees',
      status: 'approved',
      createdBy: userId,
      createdAt: now.toISOString(),
      approvedBy: userId,
      approvedAt: now.toISOString(),
    }
    db.tariffs.push(row)
  }
}
