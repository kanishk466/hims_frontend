import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { login } from '@/api/auth'
import { AppProviders } from '@/app/providers'
import { createQueryClient } from '@/app/queryClient'
import { routes } from '@/app/router'
import { useSessionStore } from '@/auth/sessionStore'
import { _unloadDb } from '@/mock/db'
import { SEED_IDS } from '@/mock/seed'
import { hasSessionToken } from '@/types/auth'

export type SeedPersona = keyof typeof SEED_IDS.users

/** No seeded test persona is simulated as MFA-gated — the MFA screens have their own tests. */
function expectToken(result: Awaited<ReturnType<typeof login>>) {
  if (!hasSessionToken(result)) throw new Error('Test login unexpectedly required an MFA step')
  return result.token
}

/** Fresh demo data, logged in as the given persona. */
export async function loginAs(persona: SeedPersona) {
  _unloadDb()
  const token = expectToken(await login(SEED_IDS.users[persona]))
  useSessionStore.getState().setToken(token)
  return token
}

/** Fresh demo data, logged in as any seeded user id (e.g. the Lotus admin). */
export async function loginAsUser(userId: string) {
  _unloadDb()
  const token = expectToken(await login(userId))
  useSessionStore.getState().setToken(token)
}

export function renderWithProviders(ui: ReactNode) {
  return render(<AppProviders client={createQueryClient()}>{ui}</AppProviders>)
}

export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { router, ...renderWithProviders(<RouterProvider router={router} />) }
}
