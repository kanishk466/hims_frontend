/** Tour stops. A stop whose target is not on screen (e.g. a menu item the role lacks) is skipped. */
export interface TourStep {
  /** Element with data-tour="<target>"; none = a centred card. */
  target?: string
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome',
    body: 'A one-minute look at where things are. Press → or Enter for next, ← to go back, Esc to close. You can start it again from your name in the top-right corner.',
  },
  {
    target: 'sidebar',
    title: 'Your menu',
    body: 'Everyone sees only the screens their role allows. A front office login will not see Billing settings or Roles, for example.',
  },
  { target: 'search', title: 'Jump anywhere', body: 'Press Ctrl+K and type a screen name, e.g. "billing" or "drugs", then Enter.' },
  {
    target: 'getting-started',
    title: 'Getting started',
    body: 'Your checklist before going live. Each line opens the right screen and ticks itself when the work is done.',
  },
  {
    target: 'nav-roles',
    title: 'Roles & permissions',
    body: 'A grid: rows are screens, columns are View, Create, Edit, Cancel, Print and Approve. Buttons a role may not use are hidden. Each role also has a discount limit.',
  },
  {
    target: 'nav-users',
    title: 'Staff logins',
    body: 'Add a login, give it roles, and use "See as this user" to check exactly what they will see.',
  },
  {
    target: 'nav-patients',
    title: 'A patient’s day in OPD',
    body: 'Patients → Check-in → Billing → Vitals → Doctor workbench. Every visit shows a progress strip; the next step is orange and opens with one click.',
  },
  { target: 'user-menu', title: 'Your menu', body: 'Show this tour again, open Getting started, switch user or log out.' },
]
