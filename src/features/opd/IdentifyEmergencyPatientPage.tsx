import { Alert, Loader } from '@mantine/core'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import { PatientForm } from './PatientForm'
import { usePatient } from './queries'

const EMERGENCY_PATH = '/opd/emergency'

/**
 * Identify an emergency (temporary) patient with full details, giving them a permanent UHID
 * (Stage 7-Patients). Replaces only the "new" branch of `EmergencyPage`'s `IdentifyModal` — the
 * existing-vs-new chooser and the merge-into-existing flow stay a modal there, since that's a
 * workflow dialog rather than a CRUD form. If the duplicate warning here finds a real existing
 * record, control goes back to `EmergencyPage`'s modal with that record pre-selected, via the
 * same router-state hand-off pattern used for `ProvisionResultModal` in Stage 7c.
 */
export function IdentifyEmergencyPatientPage() {
  const { tempId } = useParams()
  const navigate = useNavigate()
  const { data: temp, isError } = usePatient(tempId)
  const back = () => navigate(EMERGENCY_PATH)

  if (isError) return <Alert color="red">Patient not found.</Alert>
  if (!temp) return <Loader />

  return (
    <FormPage title={`Identify emergency patient ${temp.uhid}`} onBack={back} width={900}>
      <PatientForm
        patient={temp}
        onCancel={back}
        onSaved={back}
        onOpenExisting={(target) => navigate(EMERGENCY_PATH, { state: { identifyTemp: temp, identifyTarget: target } })}
      />
    </FormPage>
  )
}
