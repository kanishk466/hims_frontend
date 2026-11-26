import { SegmentedControl } from '@mantine/core'

import type { ActiveFilterValue } from '@/lib/filters'

/** Active / Inactive / All toggle used on every master list. Masters are never deleted. */
export function ActiveFilter({ value, onChange, counts }: { value: ActiveFilterValue; onChange: (v: ActiveFilterValue) => void; counts?: { active: number; inactive: number } }) {
  return (
    <SegmentedControl
      size="sm"
      value={value}
      onChange={(v) => onChange(v as ActiveFilterValue)}
      aria-label="Show active or inactive"
      data={[
        { value: 'active', label: counts ? `Active (${counts.active})` : 'Active' },
        { value: 'inactive', label: counts ? `Inactive (${counts.inactive})` : 'Inactive' },
        { value: 'all', label: 'All' },
      ]}
    />
  )
}
