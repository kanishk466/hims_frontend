import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { setViewAs } from '@/api/client'
import { useSessionStore } from '@/auth/sessionStore'
import { useTourStore } from '@/features/tour/tourStore'
import { _unloadDb } from '@/mock/db'
import { mswServer } from './msw/server.js'

// Intercepts fetch calls from the real client.ts/api/*.ts code (see src/test/msw/server.ts for
// why) so tests exercise the same HTTP-shaped code path as dev/prod, just answered in-process.
beforeAll(() => mswServer.listen({ onUnhandledFrame: 'warn' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

// UI tests run in parallel; give async queries room under load.
configure({ asyncUtilTimeout: 3000 })

// Mantine needs these browser APIs, which jsdom lacks.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver ?? (RO as unknown as typeof ResizeObserver)
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView ?? (() => {})

beforeEach(() => {
  localStorage.clear()
  _unloadDb()
  useSessionStore.getState().clear()
  // Zustand stores are module singletons that outlive a test's own render tree
  // (unmounting doesn't reset them), so a tour an earlier test auto-started —
  // or left open — must be closed here or it leaks into the next test.
  useTourStore.getState().close()
  setViewAs(null)
})
afterEach(() => cleanup())

// Mantine's autosize Textarea listens for font loading; jsdom has no document.fonts.
if (!('fonts' in document))
  Object.defineProperty(document, 'fonts', { value: { addEventListener: () => {}, removeEventListener: () => {}, ready: Promise.resolve() } })
