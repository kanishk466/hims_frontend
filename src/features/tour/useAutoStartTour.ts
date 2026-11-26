import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/auth/queries'
import { useCan } from '@/auth/useCan'
import { useTourStore } from './tourStore'

/**
 * On the dashboard: start the tour once for a clinic admin whose setup is finished and who has not
 * seen it, or whenever the page is opened with ?tour=1 (the "Take the tour" checklist line).
 */
export function useAutoStartTour() {
  const { data: session } = useSession()
  const canSetup = useCan('admin.setup.edit')
  const start = useTourStore((s) => s.start)
  const [params, setParams] = useSearchParams()
  const asked = params.get('tour') === '1'
  const firstTime = !!session && canSetup && !session.preview && !!session.clinic?.setupComplete && !session.user.tourDoneAt
  useEffect(() => {
    if (!asked && !firstTime) return
    // Let the dashboard (and the checklist card) render first so the stops can find their targets.
    const t = setTimeout(() => {
      start()
      if (asked) setParams({}, { replace: true })
    }, 600)
    return () => clearTimeout(t)
  }, [asked, firstTime, start, setParams])
}
