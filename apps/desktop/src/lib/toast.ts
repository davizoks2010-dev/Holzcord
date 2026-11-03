import { create } from 'zustand'

interface Toast { id: number; text: string; kind: 'error' | 'ok' }
interface ToastStore { items: Toast[]; push(text: string, kind?: Toast['kind']): void }
let n = 0
export const useToasts = create<ToastStore>(set => ({
  items: [],
  push: (text, kind = 'error') => {
    const id = ++n
    set(s => ({ items: [...s.items, { id, text, kind }] }))
    setTimeout(() => set(s => ({ items: s.items.filter(t => t.id !== id) })), 6000)
  }
}))
export const notify = (text: string, kind: Toast['kind'] = 'error') => useToasts.getState().push(text, kind)
