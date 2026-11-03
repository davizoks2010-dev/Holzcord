import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('holz', {
  onScreenSources: (cb: (s: { id: string; name: string; thumbnail: string }[]) => void) =>
    ipcRenderer.on('screen:sources', (_e, s) => cb(s)),
  chooseScreen: (id: string | null) => ipcRenderer.send('screen:choose', id),
  setPushToTalk: (acc: string | null) => ipcRenderer.invoke('ptt:set', acc),
  linkPreview: (url: string) => ipcRenderer.invoke('link:preview', url),
  onPushToTalk: (cb: () => void) => ipcRenderer.on('ptt:toggle', () => cb())
})
