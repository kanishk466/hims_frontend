import { Alert, Loader } from '@mantine/core'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '@/components/FormPage'
import { PatientForm } from './PatientForm'
import { usePatient } from './queries'

/** Edit an existing patient's details (Stage 7-Patients). */
export function EditPatientPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: p, isError } = usePatient(id)
  const back = () => navigate(`/opd/patients/${id}`)

  if (isError) return <Alert color="red">Patient not found.</Alert>
  if (!p) return <Loader />

  return (
    <FormPage title={`Edit ${p.name} (${p.uhid})`} onBack={back} width={900}>
      <PatientForm patient={p} onCancel={back} onSaved={back} onOpenExisting={(x) => navigate(`/opd/patients/${x.id}`)} />
    </FormPage>
  )
}
