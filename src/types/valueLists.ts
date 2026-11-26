import { z } from 'zod'

/**
 * Small lists that share one generic table and one admin screen
 * (Onboarding & Masters → master_values). Rich masters have their own tables.
 */
export type MetaField =
  | { key: string; label: string; type: 'number'; suffix?: string }
  | { key: string; label: string; type: 'boolean' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }

export interface ValueListType {
  key: string
  label: string
  group: 'Registration' | 'Visits & billing' | 'Clinical' | 'Panels'
  description: string
  fields: MetaField[]
}

export const VALUE_LIST_TYPES: ValueListType[] = [
  { key: 'salutation', label: 'Salutations', group: 'Registration', description: 'Shown before the patient’s name.', fields: [] },
  { key: 'gender', label: 'Gender', group: 'Registration', description: 'Gender options on the registration form.', fields: [] },
  { key: 'maritalStatus', label: 'Marital status', group: 'Registration', description: '', fields: [] },
  { key: 'bloodGroup', label: 'Blood groups', group: 'Registration', description: '', fields: [] },
  { key: 'relation', label: 'Relations', group: 'Registration', description: 'Relation of the guardian or next of kin.', fields: [] },
  { key: 'idProof', label: 'ID proof types', group: 'Registration', description: 'Documents accepted as identity proof.', fields: [] },
  {
    key: 'patientCategory',
    label: 'Patient categories',
    group: 'Registration',
    description: 'Used for tariffs and default discounts.',
    fields: [{ key: 'discountPercent', label: 'Default discount', type: 'number', suffix: '%' }],
  },
  { key: 'referralSource', label: 'Referral sources', group: 'Registration', description: 'How the patient heard of the hospital.', fields: [] },
  {
    key: 'visitType',
    label: 'Visit types',
    group: 'Visits & billing',
    description: 'Decides the consultation fee. Validity = days after a paid visit in which this type applies.',
    fields: [{ key: 'validityDays', label: 'Valid for', type: 'number', suffix: 'days' }],
  },
  {
    key: 'paymentMode',
    label: 'Payment modes',
    group: 'Visits & billing',
    description: 'How patients pay at the counter.',
    fields: [{ key: 'needsReference', label: 'Needs reference no.', type: 'boolean' }],
  },
  {
    key: 'discountReason',
    label: 'Discount reasons',
    group: 'Visits & billing',
    description: 'Chosen when a discount is given.',
    fields: [{ key: 'needsApproval', label: 'Needs supervisor approval', type: 'boolean' }],
  },
  { key: 'cancelReason', label: 'Cancellation / refund reasons', group: 'Visits & billing', description: 'Chosen when a bill or visit is cancelled.', fields: [] },
  {
    key: 'frequency',
    label: 'Dose frequencies',
    group: 'Clinical',
    description: 'Used in e-prescriptions. Doses per day calculates the quantity.',
    fields: [{ key: 'perDay', label: 'Doses per day', type: 'number' }],
  },
  { key: 'route', label: 'Routes', group: 'Clinical', description: 'How a drug is given.', fields: [] },
  { key: 'doseUnit', label: 'Dose units', group: 'Clinical', description: '', fields: [] },
  { key: 'timing', label: 'Timing (food)', group: 'Clinical', description: 'Before or after food, at bedtime…', fields: [] },
  { key: 'durationUnit', label: 'Duration units', group: 'Clinical', description: '', fields: [] },
  { key: 'dosageForm', label: 'Dosage forms', group: 'Clinical', description: 'Tablet, syrup, drops… used by the drug master.', fields: [] },
  {
    key: 'allergy',
    label: 'Allergies',
    group: 'Clinical',
    description: 'Quick picks for the patient’s allergy list.',
    fields: [
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        options: [
          { value: 'drug', label: 'Drug' },
          { value: 'food', label: 'Food' },
          { value: 'other', label: 'Other' },
        ],
      },
    ],
  },
  { key: 'complaint', label: 'Complaints / symptoms', group: 'Clinical', description: 'Quick picks in the doctor workbench.', fields: [] },
  { key: 'panelDocument', label: 'Panel documents', group: 'Panels', description: 'Documents a panel may require at check-in.', fields: [] },
]

export const valueListItemInputSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/, 'Up to 20 letters, numbers or hyphens'),
  label: z.string().trim().min(1, 'Enter the label'),
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
})
export type ValueListItemInput = z.infer<typeof valueListItemInputSchema>

export interface ValueListItem extends ValueListItemInput {
  id: string
  clinicId: string
  type: string
  sortOrder: number
  active: boolean
  /** Used by system logic (e.g. visit type "new", payment mode "cash"): cannot be deactivated or recoded. */
  locked: boolean
}
