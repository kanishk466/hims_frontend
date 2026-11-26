import { useNavigate, useSearchParams } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import type { Patient } from '@/types/opd'
import { PatientForm } from './PatientForm'

const LIST_PATH = '/opd/patients'

/** OPD Spec screens 1–2: register a new patient (Stage 7-Patients). */
export function RegisterPatientPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefill = params.get('prefill') ?? ''
  const back = () => navigate(LIST_PATH)

  return (
    <FormPage title="Register new patient" onBack={back} width={900}>
      <PatientForm
        patient={null}
        prefill={prefill}
        onCancel={back}
        onSaved={(p: Patient) => navigate(LIST_PATH, { state: { registered: p } })}
        onOpenExisting={(p) => navigate(`/opd/patients/${p.id}`)}
      />
    </FormPage>
  )
}
