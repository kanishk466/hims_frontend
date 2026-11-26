import { describe, expect, it } from 'vitest'
import { matchImportOption, parseImportBool } from './excelImport'

describe('parseImportBool', () => {
  it('reads yes/y/true/1 in any case as true', () => {
    for (const v of ['Yes', 'y', 'TRUE', '1', ' yes ']) expect(parseImportBool(v)).toBe(true)
  })
  it('reads everything else, including blank, as false', () => {
    for (const v of ['No', 'n', '0', '', 'maybe']) expect(parseImportBool(v)).toBe(false)
  })
})

describe('matchImportOption', () => {
  const options = [
    { value: 'fullTime', label: 'Full-time' },
    { value: 'visiting', label: 'Visiting' },
  ]
  it('matches by value, case-insensitively', () => {
    expect(matchImportOption('fullTime', options)).toBe('fullTime')
    expect(matchImportOption('FULLTIME', options)).toBe('fullTime')
  })
  it('matches by label, case-insensitively', () => {
    expect(matchImportOption('full-time', options)).toBe('fullTime')
    expect(matchImportOption('VISITING', options)).toBe('visiting')
  })
  it('returns empty string for blank or unmatched text', () => {
    expect(matchImportOption('', options)).toBe('')
    expect(matchImportOption('  ', options)).toBe('')
    expect(matchImportOption('locum', options)).toBe('')
  })
})
