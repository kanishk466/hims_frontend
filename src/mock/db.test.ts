import { describe, expect, it } from 'vitest'
import { _unloadDb, commit, db, DB_STORAGE_KEY, DB_VERSION, resetDb } from './db'

describe('mock store', () => {
  it('seeds Sunrise Hospital on first load and saves it under a versioned key', () => {
    _unloadDb()
    expect(db().clinics[0]?.name).toBe('Sunrise Hospital')
    expect(db().users.filter((u) => u.persona)).toHaveLength(8)
    expect(JSON.parse(localStorage.getItem(DB_STORAGE_KEY)!).version).toBe(DB_VERSION)
  })

  it('persists changes to localStorage across reloads', () => {
    _unloadDb()
    db().clinics[0]!.name = 'Sunrise Hospital & Research Centre'
    commit()
    _unloadDb()
    expect(db().clinics[0]!.name).toBe('Sunrise Hospital & Research Centre')
  })

  it('removes data saved under an older version key', () => {
    localStorage.setItem('hms-mock-db-v1', '{}')
    _unloadDb()
    db()
    expect(localStorage.getItem('hms-mock-db-v1')).toBeNull()
  })

  it('reseeds when saved data has an old version', () => {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify({ version: 0, clinics: [] }))
    _unloadDb()
    expect(db().clinics.map((c) => c.code)).toEqual(['sunrise', 'lotus'])
  })

  it('reset restores the demo data', () => {
    _unloadDb()
    db().users = []
    commit()
    resetDb()
    _unloadDb()
    expect(db().users.filter((u) => u.persona)).toHaveLength(8)
  })
})
