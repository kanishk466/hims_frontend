import type { Paise } from '@/types/common'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

/** 12500000 paise → "₹1,25,000.00". Money is integer paise everywhere; format only for display. */
export function formatINR(paise: Paise): string {
  if (!Number.isInteger(paise)) throw new Error('formatINR expects integer paise')
  return inr.format(paise / 100)
}

/** "1,250.50" or "1250.5" → 125050 paise. Returns null when not a valid amount. */
export function rupeesToPaise(input: string | number): Paise | null {
  const s = String(input).replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`
  return [h ? `${ONES[h]} Hundred` : '', rest].filter(Boolean).join(' ')
}

/** 125050 → "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only" (Indian lakh/crore grouping). */
export function amountInWords(paise: Paise): string {
  const rupees = Math.floor(Math.abs(paise) / 100)
  const p = Math.abs(paise) % 100
  const parts: string[] = []
  const crore = Math.floor(rupees / 10_000_000)
  const lakh = Math.floor((rupees % 10_000_000) / 100_000)
  const thousand = Math.floor((rupees % 100_000) / 1000)
  const rest = rupees % 1000
  if (crore) parts.push(`${below1000(crore)} Crore`)
  if (lakh) parts.push(`${below1000(lakh)} Lakh`)
  if (thousand) parts.push(`${below1000(thousand)} Thousand`)
  if (rest) parts.push(below1000(rest))
  const words = parts.join(' ') || 'Zero'
  return `Rupees ${words}${p ? ` and ${below1000(p)} Paise` : ''} Only`
}
