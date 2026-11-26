import { describe, expect, it } from 'vitest'
import { formatAge, formatDateTime } from './dates'
import { amountInWords, formatINR, rupeesToPaise } from './money'

describe('formatting', () => {
  it('formats paise as Indian rupees', () => {
    expect(formatINR(12500000)).toBe('₹1,25,000.00')
    expect(formatINR(15050)).toBe('₹150.50')
    expect(() => formatINR(10.5)).toThrow()
  })
  it('parses rupee input to integer paise', () => {
    expect(rupeesToPaise('1,250.5')).toBe(125050)
    expect(rupeesToPaise('300')).toBe(30000)
    expect(rupeesToPaise('12.345')).toBeNull()
  })
  it('shows UTC timestamps in IST', () => {
    expect(formatDateTime('2026-11-22T08:41:00.000Z')).toBe('22-11-2026, 02:11 PM')
  })
  it('formats age the OPD way', () => {
    const now = new Date('2026-11-22T06:00:00Z')
    expect(formatAge('1992-03-10', now)).toBe('34 Y')
    expect(formatAge('2026-03-01', now)).toBe('8 M')
    expect(formatAge('2026-11-10', now)).toBe('12 D')
  })
})

describe('amountInWords', () => {
  it('uses Indian grouping and paise', () => {
    expect(amountInWords(125050)).toBe('Rupees One Thousand Two Hundred Fifty and Fifty Paise Only')
    expect(amountInWords(1_50_00_000_00)).toBe('Rupees One Crore Fifty Lakh Only')
    expect(amountInWords(0)).toBe('Rupees Zero Only')
    expect(amountInWords(71500)).toBe('Rupees Seven Hundred Fifteen Only')
  })
})
