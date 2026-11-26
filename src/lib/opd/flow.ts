/** OPD patient journey (Register → Check-in → Pay → Vitals → Doctor → Done) for the flow strip. */
import type { VisitRow } from '@/types/opd'

export type FlowStepKey = 'register' | 'checkin' | 'pay' | 'vitals' | 'doctor' | 'done'
export type FlowState = 'done' | 'current' | 'todo' | 'skipped'

export interface FlowStep {
  key: FlowStepKey
  label: string
  state: FlowState
  /** Short status under the label, e.g. "Token 7" or "₹ due". */
  note?: string
}

type FlowVisit = Pick<VisitRow, 'status' | 'token' | 'consultPaid' | 'waiveConsultation' | 'hasVitals' | 'pendingCharges'>

export function visitFlow(v: FlowVisit): FlowStep[] {
  const closed = v.status === 'cancelled' || v.status === 'noShow'
  const paid = v.consultPaid || !!v.waiveConsultation
  const seen = v.status === 'completed'
  const inRoom = v.status === 'inConsultation'
  const steps: FlowStep[] = [
    { key: 'register', label: 'Registered', state: 'done' },
    { key: 'checkin', label: 'Checked in', state: 'done', note: `Token ${v.token}` },
    { key: 'pay', label: 'Paid', state: paid ? 'done' : 'todo', note: paid ? undefined : 'fee due' },
    // Vitals are optional unless the clinic makes them mandatory: once the doctor has the patient, a missing set is "skipped".
    { key: 'vitals', label: 'Vitals', state: v.hasVitals ? 'done' : inRoom || seen ? 'skipped' : 'todo' },
    { key: 'doctor', label: 'Doctor', state: seen ? 'done' : 'todo', note: inRoom ? 'in the room' : undefined },
    { key: 'done', label: 'Done', state: seen && v.pendingCharges === 0 && paid ? 'done' : 'todo', note: seen && v.pendingCharges > 0 ? `${v.pendingCharges} test${v.pendingCharges > 1 ? 's' : ''} to bill` : undefined },
  ]
  if (closed) return steps.map((s) => (s.state === 'done' ? s : { ...s, state: 'skipped' }))
  // The doctor may see the patient before payment (pay-after clinics): the doctor step is then current.
  const current = inRoom ? steps.find((s) => s.key === 'doctor')! : steps.find((s) => s.state === 'todo')
  if (current) current.state = 'current'
  return steps
}
