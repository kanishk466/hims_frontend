/**
 * Panel split and discount (OPD-05). Pure: amounts in paise.
 * Order: excluded service groups → patient pays in full; co-pay % per covered line;
 * fixed co-pay per visit moved from panel to patient; per-visit cap on the panel total.
 * The discount applies to the PATIENT's share only.
 */
import type { Panel } from '@/types/masters'

export interface SplitInput {
  amountPaise: number
  group: string
}

export interface SplitLine {
  panelPaise: number
  patientPaise: number
}

export function splitLines(lines: SplitInput[], panel: Pick<Panel, 'coverage'> | null): SplitLine[] {
  if (!panel) return lines.map((l) => ({ panelPaise: 0, patientPaise: l.amountPaise }))
  const { copayPercent, copayFixedPaise, excludedGroups, perVisitCapPaise } = panel.coverage
  const out = lines.map((l) => {
    if ((excludedGroups as string[]).includes(l.group)) return { panelPaise: 0, patientPaise: l.amountPaise }
    const patient = Math.round((l.amountPaise * copayPercent) / 100)
    return { panelPaise: l.amountPaise - patient, patientPaise: patient }
  })
  // Fixed co-pay per visit: take it from the panel share, line by line.
  let fixed = copayFixedPaise
  for (const l of out) {
    if (fixed <= 0) break
    const move = Math.min(fixed, l.panelPaise)
    l.panelPaise -= move
    l.patientPaise += move
    fixed -= move
  }
  // Cap: the panel pays at most perVisitCap; the rest moves to the patient, last lines first.
  if (perVisitCapPaise > 0) {
    let excess = out.reduce((s, l) => s + l.panelPaise, 0) - perVisitCapPaise
    for (let i = out.length - 1; i >= 0 && excess > 0; i--) {
      const move = Math.min(excess, out[i]!.panelPaise)
      out[i]!.panelPaise -= move
      out[i]!.patientPaise += move
      excess -= move
    }
  }
  return out
}

export interface DiscountCheck {
  amountPaise: number
  needsApproval: boolean
}

/** Discount as % of the patient's share; above the user's limit it needs approval. */
export function checkDiscount(patientGrossPaise: number, percent: number, limitPercent: number): DiscountCheck {
  const amountPaise = Math.round((patientGrossPaise * percent) / 100)
  return { amountPaise, needsApproval: percent > limitPercent }
}

/** Change to return for cash tendered (never negative). */
export const changeDue = (tenderedPaise: number, duePaise: number) => Math.max(0, tenderedPaise - duePaise)
