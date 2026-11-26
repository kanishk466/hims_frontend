/**
 * Permission grid rules (Onboarding & Masters → Simple screens for the admin):
 * - ticking any action on a screen also ticks View
 * - unticking View clears the whole row
 * Pure functions so they are easy to test.
 */
import { ACTIONS, PERMISSION_CATALOGUE, type Action, type Permission } from '@/auth/permissions'

export interface GridScreen {
  key: string // "opd.billing"
  label: string
  actions: readonly Action[]
}
export interface GridModule {
  module: string
  label: string
  screens: GridScreen[]
}

/** Clinic modules and screens, in catalogue order (platform excluded). */
export const GRID: GridModule[] = PERMISSION_CATALOGUE.filter((m) => !m.platformOnly).map((m) => ({
  module: m.module,
  label: m.label,
  screens: m.screens.map((s) => ({ key: `${m.module}.${s.key}`, label: s.label, actions: s.actions as readonly Action[] })),
}))

export const code = (screen: GridScreen, action: Action) => `${screen.key}.${action}` as Permission

export function toggleCell(perms: ReadonlySet<Permission>, screen: GridScreen, action: Action, on: boolean): Set<Permission> {
  const next = new Set(perms)
  if (action === 'view' && !on) {
    for (const a of screen.actions) next.delete(code(screen, a))
    return next
  }
  if (on) {
    next.add(code(screen, action))
    if (screen.actions.includes('view')) next.add(code(screen, 'view'))
  } else next.delete(code(screen, action))
  return next
}

/** Whole row on/off. */
export function toggleRow(perms: ReadonlySet<Permission>, screen: GridScreen, on: boolean): Set<Permission> {
  const next = new Set(perms)
  for (const a of screen.actions) {
    if (on) next.add(code(screen, a))
    else next.delete(code(screen, a))
  }
  return next
}

/** One column across a module, e.g. "Print" on every OPD screen that has Print. */
export function toggleModuleColumn(perms: ReadonlySet<Permission>, mod: GridModule, action: Action, on: boolean): Set<Permission> {
  let next = new Set(perms)
  for (const s of mod.screens) if (s.actions.includes(action)) next = toggleCell(next, s, action, on)
  return next
}

export type CheckState = 'all' | 'some' | 'none' | 'na'

export function columnState(perms: ReadonlySet<Permission>, mod: GridModule, action: Action): CheckState {
  const cells = mod.screens.filter((s) => s.actions.includes(action)).map((s) => perms.has(code(s, action)))
  if (cells.length === 0) return 'na'
  const n = cells.filter(Boolean).length
  return n === 0 ? 'none' : n === cells.length ? 'all' : 'some'
}

export function rowState(perms: ReadonlySet<Permission>, screen: GridScreen): CheckState {
  const n = screen.actions.filter((a) => perms.has(code(screen, a))).length
  return n === 0 ? 'none' : n === screen.actions.length ? 'all' : 'some'
}

export function moduleCount(perms: ReadonlySet<Permission>, mod: GridModule): { on: number; total: number } {
  let on = 0
  let total = 0
  for (const s of mod.screens)
    for (const a of s.actions) {
      total++
      if (perms.has(code(s, a))) on++
    }
  return { on, total }
}

export { ACTIONS }
