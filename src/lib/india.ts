/** Reference lists for Indian forms. In the real system these come from global master tables. */

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
] as const

export const MEDICAL_COUNCILS = [
  'National Medical Commission (NMC)',
  'Maharashtra Medical Council',
  'Karnataka Medical Council',
  'Delhi Medical Council',
  'Gujarat Medical Council',
  'Tamil Nadu Medical Council',
  'Telangana State Medical Council',
  'Andhra Pradesh Medical Council',
  'Kerala State Medical Councils',
  'West Bengal Medical Council',
  'Madhya Pradesh Medical Council',
  'Rajasthan Medical Council',
  'Uttar Pradesh Medical Council',
  'Punjab Medical Council',
  'Haryana Medical Council',
] as const

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** 0 = Sunday … 6 = Saturday (same as JavaScript's Date#getDay). */
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function formatWeekdays(days: number[]): string {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) // Monday first
  const key = sorted.join(',')
  if (key === '1,2,3,4,5,6') return 'Mon–Sat'
  if (key === '1,2,3,4,5') return 'Mon–Fri'
  if (key === '1,2,3,4,5,6,0') return 'All days'
  return sorted.map((d) => WEEKDAYS_SHORT[d]).join(', ')
}

/** "09:30" → "09:30 AM" */
export function formatClock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Readable slug for a clinic code / subdomain: "Lotus Care Clinic" → "lotuscare". */
export function suggestClinicCode(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w && !['clinic', 'hospital', 'hospitals', 'the', 'and', 'pvt', 'ltd', 'centre', 'center'].includes(w))
  return (words.slice(0, 2).join('') || 'clinic').slice(0, 20)
}
