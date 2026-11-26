import { z } from 'zod'

/** Indian mobile: 10 digits starting 6–9. */
export const mobileSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number')
export const pinCodeSchema = z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code')
export const phoneSchema = z.string().regex(/^[0-9+\-\s]{8,16}$/, 'Enter a phone number with STD code')

/** Optional text field that, when filled, must match a pattern. Empty string counts as "not given". */
export const optionalPattern = (re: RegExp, message: string) =>
  z.union([z.literal(''), z.string().regex(re, message)]).optional()

export const optionalEmail = z.union([z.literal(''), z.email('Enter a valid email address')]).optional()

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/
export const CLINIC_CODE_RE = /^[a-z][a-z0-9-]{2,19}$/
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
