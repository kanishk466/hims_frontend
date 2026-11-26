import { useNavigate, useSearchParams } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import { PatientForm } from './PatientForm'

const LIST_PATH = '/opd/checkin'

/**
 * Register a new patient from the middle of check-in (Stage 7-Patients). On success — or
 * when the duplicate warning's "use this patient" is picked — navigates back to
 * `/opd/checkin?patient=<id>`, the same URL-param hand-off `CheckInPage`'s own `pick()` used
 * to do locally: the check-in flow continues on the same screen with the patient selected.
 */
export function CheckInRegisterPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefill = params.get('prefill') ?? ''
  const back = () => navigate(LIST_PATH)
  const continueWith = (id: string) => navigate(`${LIST_PATH}?patient=${id}`)

  return (
    <FormPage title="Register new patient" subtitle="For check-in" onBack={back} width={900}>
      <PatientForm patient={null} prefill={prefill} onCancel={back} onSaved={(p) => continueWith(p.id)} onOpenExisting={(p) => continueWith(p.id)} />
    </FormPage>
  )
}
