import { Button, Group, Paper, Portal, Text } from '@mantine/core'
import { useWindowEvent } from '@mantine/hooks'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { markTourDone } from '@/api/gettingStarted'
import { useQueryClient } from '@tanstack/react-query'
import { TOUR_STEPS } from './steps'
import { useTourStore } from './tourStore'

const PAD = 6
const CARD_W = 320

/** Spotlight tour: dims the page, outlines one element and explains it. */
export function Tour() {
  const { open, index, go, close } = useTourStore()
  const qc = useQueryClient()
  const [, setTick] = useState(0)
  const rerender = () => setTick((t) => t + 1)
  useWindowEvent('resize', rerender)
  useWindowEvent('scroll', rerender, { capture: true })

  // Only the stops whose target is on this screen for this user.
  const steps = useMemo(() => (open ? TOUR_STEPS.filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`)) : []), [open])
  const step = steps[index]
  const el = step?.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null

  useLayoutEffect(() => {
    el?.scrollIntoView({ block: 'nearest' })
  }, [el])

  const finish = () => {
    close()
    markTourDone()
      .then(() => qc.invalidateQueries({ queryKey: ['session'] }))
      .catch(() => undefined)
  }
  const next = () => (index + 1 < steps.length ? go(index + 1) : finish())
  const back = () => index > 0 && go(index - 1)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open || !step) return null

  const r = el?.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let cardStyle: React.CSSProperties
  if (!r) cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  else if (r.right + PAD + 16 + CARD_W < vw) cardStyle = { top: Math.min(Math.max(16, r.top), vh - 240), left: r.right + PAD + 16 }
  else if (r.bottom + 220 < vh) cardStyle = { top: r.bottom + PAD + 12, left: Math.min(Math.max(16, r.right - CARD_W), vw - CARD_W - 16) }
  else cardStyle = { top: Math.max(16, r.top - 220), left: Math.min(Math.max(16, r.left), vw - CARD_W - 16) }

  return (
    <Portal>
      {/* Click-catcher so the page underneath is not used mid-tour. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: r ? 'transparent' : 'rgba(0,0,0,0.55)' }} onClick={(e) => e.stopPropagation()} />
      {r && <Spotlight top={r.top - PAD} left={r.left - PAD} width={r.width + PAD * 2} height={Math.min(r.height + PAD * 2, vh)} />}
      <Paper role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`} pos="fixed" w={CARD_W} p="md" radius="md" shadow="xl" style={{ zIndex: 1002, ...cardStyle }}>
        <Text size="xs" c="dimmed">
          {index + 1} of {steps.length}
        </Text>
        <Text fw={700} mt={2}>
          {step.title}
        </Text>
        <Text size="sm" mt={6}>
          {step.body}
        </Text>
        <Group justify="space-between" mt="md">
          <Button variant="subtle" color="gray" size="compact-sm" onClick={finish}>
            Skip tour
          </Button>
          <Group gap="xs">
            {index > 0 && (
              <Button variant="default" size="compact-sm" onClick={back}>
                Back
              </Button>
            )}
            <Button size="compact-sm" onClick={next} autoFocus>
              {index + 1 < steps.length ? 'Next' : 'Done'}
            </Button>
          </Group>
        </Group>
      </Paper>
    </Portal>
  )
}

const SHADE = 'rgba(0,0,0,0.55)'

/** Four dark panels around the hole (a huge box-shadow is not drawn reliably by every browser). */
function Spotlight({ top, left, width, height }: { top: number; left: number; width: number; height: number }) {
  const panel = (style: React.CSSProperties) => <div style={{ position: 'fixed', zIndex: 1001, background: SHADE, pointerEvents: 'none', ...style }} />
  return (
    <>
      {panel({ top: 0, left: 0, right: 0, height: Math.max(0, top) })}
      {panel({ top: top + height, left: 0, right: 0, bottom: 0 })}
      {panel({ top, left: 0, width: Math.max(0, left), height })}
      {panel({ top, left: left + width, right: 0, height })}
      <div
        style={{ position: 'fixed', zIndex: 1001, top, left, width, height, borderRadius: 10, outline: '2px solid var(--mantine-color-teal-4)', pointerEvents: 'none' }}
      />
    </>
  )
}
