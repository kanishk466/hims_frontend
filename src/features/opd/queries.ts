import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bookAppointment, cancelAppointment, getDaySlots, listAppointments, rescheduleAppointment } from '@/api/appointments'
import { cancelBill, createBill, decideDiscount, getBill, getBillingContext, listBills, previewBill, takePayment, type BillDraft } from '@/api/billing'
import { addAddendum, cancelOrder, completeConsultation, getConsultation, getPrescriptionView, orderServices, saveNote, saveRxTemplate, searchIcd10 } from '@/api/emr'
import { confirmTemporaryPatient, getEmergencyContext, mergeTemporaryPatient, recordMlc, registerEmergency } from '@/api/emergency'
import { createPatient, getPatient, searchPatients, updatePatient, verifyAbha } from '@/api/patients'
import { getVitals, saveVitals } from '@/api/vitals'
import { sendMessage, type SendMessageInput } from '@/api/messages'
import {
  callNext,
  callVisit,
  cancelVisit,
  checkIn,
  getVisit,
  listVisits,
  markNoShow,
  previewCheckIn,
  recallVisit,
  referVisit,
  skipVisit,
  transferVisit,
  tvBoard,
  type VisitQuery,
} from '@/api/visits'
import type { AppointmentInput, CheckInInput, EmergencyInput, NoteContent, PatientInput, PaymentInput, ReferralInput, VitalsInput } from '@/types/opd'

/** Every OPD change can affect lists on other screens: refresh the OPD queries together. */
const OPD_KEYS = ['visits', 'visit', 'billing', 'bills', 'consultation', 'vitals', 'appointments', 'slots', 'patients', 'patient', 'tv', 'checkInPreview', 'emergency', 'dayEnd', 'reports']
function useOpdRefresh() {
  const qc = useQueryClient()
  return () => {
    for (const k of OPD_KEYS) qc.invalidateQueries({ queryKey: [k] })
  }
}
function useOpdMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const refresh = useOpdRefresh()
  return useMutation({ mutationFn: fn, onSuccess: refresh })
}

/* Patients */
export const usePatientSearch = (q: string, enabled = true) =>
  useQuery({ queryKey: ['patients', q], queryFn: () => searchPatients(q), enabled, placeholderData: keepPreviousData })
export const usePatient = (id: string | null | undefined) => useQuery({ queryKey: ['patient', id], queryFn: () => getPatient(id!), enabled: !!id })
export const useSavePatient = () => useOpdMutation(({ id, input }: { id?: string; input: PatientInput }) => (id ? updatePatient(id, input) : createPatient(input)))
export const useVerifyAbha = () => useOpdMutation((id: string) => verifyAbha(id))
/** Simulated SMS/WhatsApp send: no list refresh needed (nothing else changes). */
export const useSendMessage = () => useMutation({ mutationFn: (input: SendMessageInput) => sendMessage(input) })

/* Appointments */
export const useDaySlots = (doctorId: string | null, date: string) =>
  useQuery({ queryKey: ['slots', doctorId, date], queryFn: () => getDaySlots(doctorId!, date), enabled: !!doctorId, placeholderData: keepPreviousData })
export const useAppointments = (date: string, doctorId?: string) => useQuery({ queryKey: ['appointments', date, doctorId], queryFn: () => listAppointments(date, doctorId) })
export const useBookAppointment = () => useOpdMutation((input: AppointmentInput) => bookAppointment(input))
export const useRescheduleAppointment = () => useOpdMutation(({ id, to }: { id: string; to: { doctorId: string; date: string; slot: string } }) => rescheduleAppointment(id, to))
export const useCancelAppointment = () => useOpdMutation(({ id, reason }: { id: string; reason: string }) => cancelAppointment(id, reason))

/* Visits, queue */
export const useVisits = (q: VisitQuery, refetchInterval?: number) =>
  useQuery({ queryKey: ['visits', q], queryFn: () => listVisits(q), refetchInterval, placeholderData: keepPreviousData })
export const useVisit = (id: string | null | undefined) => useQuery({ queryKey: ['visit', id], queryFn: () => getVisit(id!), enabled: !!id })
export const useCheckInPreview = (q: { patientId?: string; doctorId?: string | null; payerId: string; category?: string; visitType?: string }) =>
  useQuery({
    queryKey: ['checkInPreview', q],
    queryFn: () => previewCheckIn({ patientId: q.patientId!, doctorId: q.doctorId!, payerId: q.payerId, category: q.category ?? 'general', visitType: q.visitType }),
    enabled: !!q.patientId && !!q.doctorId,
    placeholderData: keepPreviousData,
  })
export const useCheckIn = () => useOpdMutation((input: CheckInInput) => checkIn(input))
export const useCallVisit = () => useOpdMutation((id: string) => callVisit(id))
export const useCallNext = () => useOpdMutation((doctorId: string) => callNext(doctorId))
export const useSkipVisit = () => useOpdMutation((id: string) => skipVisit(id))
export const useRecallVisit = () => useOpdMutation((id: string) => recallVisit(id))
export const useTransferVisit = () => useOpdMutation(({ id, doctorId, reason }: { id: string; doctorId: string; reason: string }) => transferVisit(id, doctorId, reason))
export const useReferVisit = () => useOpdMutation(({ id, input }: { id: string; input: ReferralInput }) => referVisit(id, input))
export const useNoShow = () => useOpdMutation((id: string) => markNoShow(id))
export const useCancelVisit = () => useOpdMutation(({ id, reason }: { id: string; reason: string }) => cancelVisit(id, reason))
export const useTvBoard = () => useQuery({ queryKey: ['tv'], queryFn: tvBoard, refetchInterval: 2000 })

/* Billing */
export const useBillingContext = (visitId: string | null) => useQuery({ queryKey: ['billing', visitId], queryFn: () => getBillingContext(visitId!), enabled: !!visitId })
export const useBillPreview = (visitId: string | null, draft: BillDraft) =>
  useQuery({ queryKey: ['billing', 'preview', visitId, draft], queryFn: () => previewBill(visitId!, draft), enabled: !!visitId && draft.lines.length > 0, placeholderData: keepPreviousData, retry: false })
export const useBills = (date?: string) => useQuery({ queryKey: ['bills', date], queryFn: () => listBills(date) })
export const useBill = (id: string | null | undefined) => useQuery({ queryKey: ['bills', 'one', id], queryFn: () => getBill(id!), enabled: !!id })
export const useCreateBill = () => useOpdMutation(({ visitId, draft }: { visitId: string; draft: BillDraft }) => createBill(visitId, draft))
export const useTakePayment = () => useOpdMutation(({ billId, input }: { billId: string; input: PaymentInput }) => takePayment(billId, input))
export const useDecideDiscount = () => useOpdMutation(({ billId, approve }: { billId: string; approve: boolean }) => decideDiscount(billId, approve))
export const useCancelBill = () => useOpdMutation(({ billId, reason }: { billId: string; reason: string }) => cancelBill(billId, reason))

/* Vitals */
export const useVitals = (visitId: string | null) => useQuery({ queryKey: ['vitals', visitId], queryFn: () => getVitals(visitId!), enabled: !!visitId })
export const useSaveVitals = () => useOpdMutation(({ visitId, input }: { visitId: string; input: VitalsInput }) => saveVitals(visitId, input))

/* EMR */
export const useConsultation = (visitId: string | undefined) => useQuery({ queryKey: ['consultation', visitId], queryFn: () => getConsultation(visitId!), enabled: !!visitId })
export const useIcdSearch = (q: string) => useQuery({ queryKey: ['icd', q], queryFn: () => searchIcd10(q), enabled: q.trim().length >= 2, placeholderData: keepPreviousData })
/** Autosave: no list refresh (keeps typing smooth). */
export const useSaveNote = () => useMutation({ mutationFn: ({ visitId, content }: { visitId: string; content: NoteContent }) => saveNote(visitId, content) })
export const useCompleteConsultation = () => useOpdMutation(({ visitId, content }: { visitId: string; content: NoteContent }) => completeConsultation(visitId, content))
export const useAddAddendum = () => useOpdMutation(({ visitId, text }: { visitId: string; text: string }) => addAddendum(visitId, text))
export const useOrderServices = () => useOpdMutation(({ visitId, serviceIds }: { visitId: string; serviceIds: string[] }) => orderServices(visitId, serviceIds))
export const useCancelOrder = () => useOpdMutation((id: string) => cancelOrder(id))
export function useSaveRxTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ visitId, name, content }: { visitId: string; name: string; content: Pick<NoteContent, 'complaints' | 'diagnoses' | 'rx' | 'advice'> }) => saveRxTemplate(visitId, name, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultation'] }),
  })
}
export const usePrescriptionView = (visitId: string | undefined) => useQuery({ queryKey: ['consultation', 'rx', visitId], queryFn: () => getPrescriptionView(visitId!), enabled: !!visitId })

/* Emergency (OPD-14) */
export const useEmergencyContext = () => useQuery({ queryKey: ['emergency'], queryFn: getEmergencyContext, refetchInterval: 15_000 })
export const useRegisterEmergency = () => useOpdMutation((input: EmergencyInput) => registerEmergency(input))
export const useRecordMlc = () => useOpdMutation(({ visitId, mlc }: { visitId: string; mlc: { policeStation: string; mlcNo: string; officerName?: string } }) => recordMlc(visitId, mlc))
export const useMergeTemporaryPatient = () => useOpdMutation(({ tempId, targetId }: { tempId: string; targetId: string }) => mergeTemporaryPatient(tempId, targetId))
export const useConfirmTemporaryPatient = () => useOpdMutation(({ id, input }: { id: string; input: PatientInput }) => confirmTemporaryPatient(id, input))
