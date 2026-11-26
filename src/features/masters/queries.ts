import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDepartment, listDepartments, setDepartmentActive, updateDepartment } from '@/api/departments'
import { createDoctor, listDoctors, setDoctorActive, updateDoctor } from '@/api/doctors'
import { createSchedule, listSchedules, setScheduleActive, updateSchedule } from '@/api/schedules'
import type { DepartmentInput, DoctorInput, ScheduleInput } from '@/types/masters'
import { moveDepartment } from '@/api/departments'
import { cancelLeave, createLeave, listLeaves } from '@/api/leaves'
import { createService, listServices, setServiceActive, updateService } from '@/api/services'
import { approveTariff, cancelTariff, createTariff, listTariffs, type TariffQuery } from '@/api/tariffs'
import { createPanel, listPanels, setPanelActive, updatePanel } from '@/api/panels'
import { createDrug, listDrugs, listGenerics, setDrugActive, updateDrug, type DrugQuery } from '@/api/drugs'
import { createValueListItem, listValueList, moveValueListItem, setValueListItemActive, updateValueListItem, valueListCounts } from '@/api/valueLists'
import type { DrugInput, LeaveInput, PanelInput, ServiceInput, TariffInput } from '@/types/masters'
import type { ValueListItemInput } from '@/types/valueLists'

export const masterKeys = {
  departments: (includeInactive = false) => ['departments', { includeInactive }] as const,
  doctors: (includeInactive = false) => ['doctors', { includeInactive }] as const,
  schedules: () => ['schedules'] as const,
}

/** After any master change: refresh lists, setup progress and the session's setupComplete flag. */
function useInvalidate(...roots: string[]) {
  const qc = useQueryClient()
  return () => {
    for (const r of [...roots, 'setupProgress', 'session', 'clinics']) qc.invalidateQueries({ queryKey: [r] })
  }
}

export const useDepartments = (includeInactive = false) =>
  useQuery({ queryKey: masterKeys.departments(includeInactive), queryFn: () => listDepartments({ includeInactive }) })

export function useSaveDepartment() {
  const invalidate = useInvalidate('departments', 'doctors')
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: DepartmentInput }) => (id ? updateDepartment(id, input) : createDepartment(input)),
    onSuccess: invalidate,
  })
}

export function useSetDepartmentActive() {
  const invalidate = useInvalidate('departments')
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setDepartmentActive(id, active), onSuccess: invalidate })
}

export const useDoctors = (includeInactive = false) =>
  useQuery({ queryKey: masterKeys.doctors(includeInactive), queryFn: () => listDoctors({ includeInactive }) })

export function useSaveDoctor() {
  const invalidate = useInvalidate('doctors')
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: DoctorInput }) => (id ? updateDoctor(id, input) : createDoctor(input)),
    onSuccess: invalidate,
  })
}

export function useSetDoctorActive() {
  const invalidate = useInvalidate('doctors', 'schedules')
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setDoctorActive(id, active), onSuccess: invalidate })
}

export const useSchedules = () => useQuery({ queryKey: masterKeys.schedules(), queryFn: () => listSchedules() })

export function useSaveSchedule() {
  const invalidate = useInvalidate('schedules')
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ScheduleInput }) => (id ? updateSchedule(id, input) : createSchedule(input)),
    onSuccess: invalidate,
  })
}

export function useSetScheduleActive() {
  const invalidate = useInvalidate('schedules')
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setScheduleActive(id, active), onSuccess: invalidate })
}

/* ---------- Step 4 masters ---------- */

function useInvalidateKeys(...keys: string[]) {
  const qc = useQueryClient()
  return () => {
    for (const k of keys) qc.invalidateQueries({ queryKey: [k] })
  }
}

export function useMoveDepartment() {
  const inv = useInvalidateKeys('departments')
  return useMutation({ mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => moveDepartment(id, direction), onSuccess: inv })
}

export const useLeaves = (includePast = false) => useQuery({ queryKey: ['leaves', includePast], queryFn: () => listLeaves({ includePast }) })
export function useCreateLeave() {
  const inv = useInvalidateKeys('leaves')
  return useMutation({ mutationFn: (input: LeaveInput) => createLeave(input), onSuccess: inv })
}
export function useCancelLeave() {
  const inv = useInvalidateKeys('leaves')
  return useMutation({ mutationFn: (id: string) => cancelLeave(id), onSuccess: inv })
}

export const useServices = (includeInactive = false) =>
  useQuery({ queryKey: ['services', includeInactive], queryFn: () => listServices({ includeInactive }) })
export function useSaveService() {
  const inv = useInvalidateKeys('services', 'tariffs')
  return useMutation({ mutationFn: ({ id, input }: { id?: string; input: ServiceInput }) => (id ? updateService(id, input) : createService(input)), onSuccess: inv })
}
export function useSetServiceActive() {
  const inv = useInvalidateKeys('services')
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setServiceActive(id, active), onSuccess: inv })
}

export const useTariffs = (q: TariffQuery) => useQuery({ queryKey: ['tariffs', q], queryFn: () => listTariffs(q), placeholderData: keepPreviousData })
export function useCreateTariff() {
  const inv = useInvalidateKeys('tariffs', 'priceCheck')
  return useMutation({ mutationFn: (input: TariffInput) => createTariff(input), onSuccess: inv })
}
export function useApproveTariff() {
  const inv = useInvalidateKeys('tariffs', 'priceCheck')
  return useMutation({ mutationFn: (id: string) => approveTariff(id), onSuccess: inv })
}
export function useCancelTariff() {
  const inv = useInvalidateKeys('tariffs', 'priceCheck')
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelTariff(id, reason), onSuccess: inv })
}

export const usePanels = (includeInactive = false) => useQuery({ queryKey: ['panels', includeInactive], queryFn: () => listPanels({ includeInactive }) })
export function useSavePanel() {
  const inv = useInvalidateKeys('panels', 'tariffs')
  return useMutation({ mutationFn: ({ id, input }: { id?: string; input: PanelInput }) => (id ? updatePanel(id, input) : createPanel(input)), onSuccess: inv })
}
export function useSetPanelActive() {
  const inv = useInvalidateKeys('panels')
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setPanelActive(id, active), onSuccess: inv })
}

export const useDrugs = (q: DrugQuery) => useQuery({ queryKey: ['drugs', q], queryFn: () => listDrugs(q), placeholderData: keepPreviousData })
export const useGenerics = () => useQuery({ queryKey: ['drugGenerics'], queryFn: listGenerics, staleTime: 60_000 })
export function useSaveDrug() {
  const inv = useInvalidateKeys('drugs', 'drugGenerics')
  return useMutation({ mutationFn: ({ id, input }: { id?: string; input: DrugInput }) => (id ? updateDrug(id, input) : createDrug(input)), onSuccess: inv })
}
export function useSetDrugActive() {
  const inv = useInvalidateKeys('drugs')
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setDrugActive(id, active), onSuccess: inv })
}

/** Items of one value list (active only unless includeInactive). Used by forms everywhere. */
export const useValueList = (type: string, includeInactive = false) =>
  useQuery({ queryKey: ['valueList', type, includeInactive], queryFn: () => listValueList(type, { includeInactive }), staleTime: 60_000 })
export const useValueListCounts = () => useQuery({ queryKey: ['valueList', 'counts'], queryFn: valueListCounts })
export function useSaveValueListItem() {
  const inv = useInvalidateKeys('valueList')
  return useMutation({
    mutationFn: ({ id, type, input }: { id?: string; type: string; input: ValueListItemInput }) => (id ? updateValueListItem(id, input) : createValueListItem(type, input)),
    onSuccess: inv,
  })
}
export function useSetValueListItemActive() {
  const inv = useInvalidateKeys('valueList')
  return useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setValueListItemActive(id, active), onSuccess: inv })
}
export function useMoveValueListItem() {
  const inv = useInvalidateKeys('valueList')
  return useMutation({ mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => moveValueListItem(id, direction), onSuccess: inv })
}
