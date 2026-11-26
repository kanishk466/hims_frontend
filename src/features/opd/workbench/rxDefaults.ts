import type { Drug } from '@/types/masters'
import type { RxItem } from '@/types/opd'

/** Sensible first values when a drug is added, so most lines need no typing. */
export function newRxItem(d: Drug): RxItem {
  const f = d.form.toUpperCase()
  const route = f.includes('EYE')
    ? 'EYE'
    : f.includes('NASAL')
      ? 'NAS'
      : ['INHALER', 'RESPULES'].includes(f)
        ? 'INH'
        : ['OINTMENT', 'CREAM', 'GEL', 'LOTION'].includes(f)
          ? 'TOP'
          : f === 'INJECTION'
            ? 'IM'
            : 'PO'
  const dose = ['SYRUP', 'SUSPENSION'].includes(f) ? '5 ml' : f.includes('DROPS') ? '1 drop' : f === 'INHALER' ? '2 puffs' : route === 'TOP' ? 'Apply thin layer' : '1'
  return {
    drugId: d.id,
    brand: d.brand,
    generic: d.generic,
    strength: d.strength,
    form: d.form,
    dose,
    frequency: 'BD',
    route,
    timing: route === 'PO' ? 'AF' : '',
    duration: 5,
    durationUnit: 'D',
  }
}
