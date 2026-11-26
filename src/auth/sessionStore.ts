import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setAuthToken, setViewAs } from '@/api/client'

/**
 * Client-side session state: the token (like a cookie) and, in "See as this user"
 * mode, the previewed user's id (like an X-View-As header).
 * Who the user is and what they may do comes from the API (useSession).
 */
interface SessionState {
  token: string | null
  viewAsUserId: string | null
  setToken: (token: string) => void
  setViewAsUser: (userId: string | null) => void
  clear: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      viewAsUserId: null,
      setToken: (token) => set({ token, viewAsUserId: null }),
      setViewAsUser: (viewAsUserId) => set({ viewAsUserId }),
      clear: () => set({ token: null, viewAsUserId: null }),
    }),
    { name: 'hms-session' },
  ),
)

// Keep the API client's "headers" in sync with the store.
const sync = (s: Pick<SessionState, 'token' | 'viewAsUserId'>) => {
  setAuthToken(s.token)
  setViewAs(s.viewAsUserId)
}
sync(useSessionStore.getState())
useSessionStore.subscribe(sync)
