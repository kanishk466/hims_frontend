import { describe, expect, it } from 'vitest'
import type { Permission } from '@/auth/permissions'
import { columnState, GRID, toggleCell, toggleModuleColumn, toggleRow } from './grid'

const opd = GRID.find((m) => m.module === 'opd')!
const billing = opd.screens.find((s) => s.key === 'opd.billing')!
const none = new Set<Permission>()

describe('permission grid rules', () => {
  it('ticking an action also ticks View', () => {
    expect([...toggleCell(none, billing, 'cancel', true)].sort()).toEqual(['opd.billing.cancel', 'opd.billing.view'])
  })

  it('unticking View clears the whole row', () => {
    const all = toggleRow(none, billing, true)
    expect(all.size).toBe(5)
    expect(toggleCell(all, billing, 'view', false).size).toBe(0)
  })

  it('unticking another action keeps View', () => {
    const two = toggleCell(none, billing, 'print', true)
    expect([...toggleCell(two, billing, 'print', false)]).toEqual(['opd.billing.view'])
  })

  it('a module column ticks that action (and View) on every screen that has it', () => {
    const next = toggleModuleColumn(none, opd, 'print', true)
    expect([...next].filter((p) => p.endsWith('.print')).sort()).toEqual([
      'opd.billing.print', 'opd.checkin.print', 'opd.dayEnd.print', 'opd.prescription.print', 'opd.registration.print',
    ])
    expect(next.has('opd.registration.view')).toBe(true)
    expect(columnState(next, opd, 'print')).toBe('all')
    expect(columnState(next, opd, 'view')).toBe('some')
  })

  it('excludes platform permissions from the grid', () => {
    expect(GRID.some((m) => m.module === 'platform')).toBe(false)
  })
})
