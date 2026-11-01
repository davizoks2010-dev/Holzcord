import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, Tray, Menu, globalShortcut, nativeImage } from 'electron'
import path from 'node:path'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let pendingScreenResolve: ((id: string | null) => void) | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 940, minHeight: 560,
    backgroundColor: '#1e1f22', title: 'Holzcord',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.on('close', (e) => { if (!(app as any).quitting) { e.preventDefault(); win?.hide() } })
}

// Compartilhamento de tela: o renderer chama getDisplayMedia; mostramos um seletor proprio.
function setupScreenShare() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
    win?.webContents.send('screen:sources', sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() })))
    const id = await new Promise<string | null>(res => { pendingScreenResolve = res })
    const chosen = sources.find(s => s.id === id)
    if (!chosen) return callback({})
    // audio de loopback do sistema (Windows)
    callback({ video: chosen, audio: process.platform === 'win32' ? 'loopback' : undefined })
  })
  ipcMain.on('screen:choose', (_e, id: string | null) => { pendingScreenResolve?.(id); pendingScreenResolve = null })
}

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(['media', 'display-capture', 'notifications', 'mediaKeySystem'].includes(permission)))
}

// Push-to-talk global
function registerPtt(accelerator: string | null) {
  globalShortcut.unregisterAll()
  if (!accelerator) return
  try { globalShortcut.register(accelerator, () => win?.webContents.send('ptt:toggle')) } catch { /* atalho invalido */ }
}

app.whenReady().then(async () => {
  setupPermissions(); setupScreenShare(); createWindow()
  ipcMain.handle('ptt:set', (_e, acc: string | null) => registerPtt(acc))
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Holzcord')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Holzcord', click: () => win?.show() },
    { label: 'Sair', click: () => { (app as any).quitting = true; app.quit() } }
  ]))
  tray.on('click', () => win?.show())
  if (app.isPackaged) {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }
})
app.on('before-quit', () => { (app as any).quitting = true })
app.on('will-quit', () => globalShortcut.unregisterAll())
const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else app.on('second-instance', () => { win?.show(); win?.focus() })
