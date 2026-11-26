import { Button } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconAmbulance } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useCan } from '@/auth/useCan'

/** F9 anywhere in the app opens emergency registration (for users who may register emergencies). */
export function EmergencyHotkey() {
  const can = useCan('opd.emergency.create')
  const navigate = useNavigate()
  useHotkeys(can ? [['F9', () => navigate('/opd/emergency')]] : [], [])
  return null
}

/** Red button for page headers on the front-desk screens. */
export function EmergencyButton() {
  const can = useCan('opd.emergency.create')
  const navigate = useNavigate()
  if (!can) return null
  return (
    <Button color="red" variant="light" leftSection={<IconAmbulance size={16} />} onClick={() => navigate('/opd/emergency')} title="F9 from any screen">
      Emergency (F9)
    </Button>
  )
}
