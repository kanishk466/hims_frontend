import { z } from 'zod'

/** Opaque record id (UUID). */
export const idSchema = z.string().min(1)
export type Id = z.infer<typeof idSchema>

/** UTC ISO-8601 timestamp, e.g. "2026-11-22T08:41:00.000Z". Shown in IST by lib/dates. */
export const isoDateTimeSchema = z.string().min(1)
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>

/** Money is always integer paise. ₹150.00 = 15000. */
export const paiseSchema = z.number().int()
export type Paise = z.infer<typeof paiseSchema>

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Fields every cancellable clinical/billing record carries. Nothing is ever hard-deleted. */
export const cancellableSchema = z.object({
  status: z.string(),
  cancelReason: z.string().optional(),
  cancelledBy: idSchema.optional(),
  cancelledAt: isoDateTimeSchema.optional(),
})
