import { useStorage } from '@eivmosn/utils'
import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light'

const storage = useStorage({ prefix: 'ps5lb.', type: 'localStorage' })
const KEY = 'theme'

function resolveInitial(): ThemeMode {
  const forced = new URLSearchParams(window.location.search).get('theme')
  if (forced === 'dark' || forced === 'light') return forced
  const saved = storage.getStorage<ThemeMode>(KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.style.colorScheme = mode
}

interface ThemeStore {
  mode: ThemeMode
  toggle: () => void
}

apply(resolveInitial())

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: resolveInitial(),

  toggle: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark'
    storage.setStorage(KEY, next)
    apply(next)
    set({ mode: next })
  },
}))
