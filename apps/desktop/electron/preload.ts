import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('holz', {
  onScreenSources: (cb: (s: { id: string; name: string; thumbnail: string }[]) => void) =>
    ipcRenderer.on('screen:sources', (_e, s) => cb(s)),
  chooseScreen: (id: string | null) => ipcRenderer.send('screen:choose', id),
  setPushToTalk: (acc: string | null) => ipcRenderer.invoke('ptt:set', acc),
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (cb: (s: unknown) => void) => { ipcRenderer.on('update:status', (_e, s) => cb(s)) }
  },
  linkPreview: (url: string) => ipcRenderer.invoke('link:preview', url),
  onPushToTalk: (cb: () => void) => ipcRenderer.on('ptt:toggle', () => cb())
})
