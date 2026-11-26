/** Paper sizes for prints: sheet width on screen and the @page rule for the printer. */
export const PAGE_SIZES = {
  thermal: { width: '80mm', page: '80mm auto', margin: '3mm', padding: '3mm' },
  a5: { width: '148mm', page: 'A5', margin: '8mm', padding: '8mm' },
  a4: { width: '210mm', page: 'A4', margin: '12mm', padding: '12mm' },
  card: { width: '86mm', page: '86mm 54mm', margin: '0', padding: '3mm' },
} as const
export type PageSize = keyof typeof PAGE_SIZES
