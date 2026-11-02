import { create } from 'zustand'

export interface Settings { theme: 'dark' | 'light' | 'system'; notifications: boolean; ptt: string; noiseSuppression: boolean; echoCancellation: boolean }
const KEY = 'holz.settings'
const DEFAULTS: Settings = { theme: 'dark', notifications: true, ptt: '', noiseSuppression: true, echoCancellation: true }

function load(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS }
}
export function applyTheme(t: Settings['theme']) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}
export const useSettings = create<Settings & { set(p: Partial<Settings>): void }>(set => ({
  ...load(),
  set: p => set(s => {
    const next = { ...s, ...p }
    const { set: _omit, ...plain } = next; void _omit
    try { localStorage.setItem(KEY, JSON.stringify(plain)) } catch { /* sem armazenamento */ }
    if (p.theme) applyTheme(p.theme)
    return next
  })
}))
