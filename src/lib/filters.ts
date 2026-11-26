export type ActiveFilterValue = 'active' | 'inactive' | 'all'

export const matchesActive = (active: boolean, f: ActiveFilterValue) => f === 'all' || (f === 'active' ? active : !active)

/** Case-insensitive "contains" over several fields. */
export const matchesText = (q: string, ...fields: (string | null | undefined)[]) => {
  const n = q.trim().toLowerCase()
  return !n || fields.some((f) => f?.toLowerCase().includes(n))
}
