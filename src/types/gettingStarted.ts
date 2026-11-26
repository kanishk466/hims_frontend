/** The admin's "Getting started" card: setup steps, then the go-live checks. */
export type GettingStartedKey = 'profile' | 'departments' | 'doctors' | 'schedules' | 'users' | 'roles' | 'preview' | 'testVisit' | 'tour'

export interface GettingStartedItem {
  key: GettingStartedKey
  group: 'setup' | 'goLive'
  label: string
  /** One line on why it matters or what is missing. */
  hint: string
  done: boolean
  /** Screen that does this item. */
  path: string
  /** The admin ticks it by hand ("Looks fine"); the rest are worked out from the data. */
  manual?: boolean
}

export interface GettingStarted {
  items: GettingStartedItem[]
  done: number
  total: number
  hidden: boolean
}
