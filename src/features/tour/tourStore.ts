import { create } from 'zustand'

interface TourState {
  open: boolean
  index: number
  start: () => void
  go: (index: number) => void
  close: () => void
}

/** Product tour state; the overlay itself is <Tour /> in the app layout. */
export const useTourStore = create<TourState>((set) => ({
  open: false,
  index: 0,
  start: () => set({ open: true, index: 0 }),
  go: (index) => set({ index }),
  close: () => set({ open: false, index: 0 }),
}))
