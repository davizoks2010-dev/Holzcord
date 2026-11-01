import { create } from 'zustand'
import type { Channel, Server } from './supabase'

interface UI {
  server: Server | null; channel: Channel | null
  setServer(s: Server | null): void; setChannel(c: Channel | null): void
}
export const useUI = create<UI>(set => ({
  server: null, channel: null,
  setServer: server => set({ server, channel: null }),
  setChannel: channel => set({ channel })
}))
