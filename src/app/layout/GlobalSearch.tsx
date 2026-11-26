import { Spotlight, type SpotlightActionData } from '@mantine/spotlight'
import { IconSearch } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { usePermissions } from '@/auth/useCan'
import { filterMenu } from '../menu'

/**
 * Ctrl+K search. Step 1: jump to any screen you can open.
 * Step 5 adds patient search by name, mobile or UHID.
 */
export function GlobalSearch() {
  const navigate = useNavigate()
  const perms = usePermissions()
  const actions = filterMenu((p) => perms.has(p)).map((g) => ({
    group: g.label,
    actions: g.items.map<SpotlightActionData>((i) => {
      const Icon = i.icon
      return {
        id: i.key,
        label: i.label,
        description: i.description,
        leftSection: <Icon size={20} stroke={1.5} />,
        onClick: () => (i.fullScreen ? window.open(i.path, '_blank') : navigate(i.path)),
      }
    }),
  }))

  return (
    <Spotlight
      actions={actions}
      shortcut={['mod + K']}
      nothingFound="No matching screen. Patient search arrives in step 5."
      highlightQuery
      limit={12}
      searchProps={{ leftSection: <IconSearch size={18} />, placeholder: 'Go to a screen…' }}
    />
  )
}
