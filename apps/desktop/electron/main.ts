import { app, BrowserWindow, desktopCapturer, ipcMain, net, session, shell, Tray, Menu, globalShortcut, nativeImage } from 'electron'
import path from 'node:path'
import dns from 'node:dns/promises'
import nodeNet from 'node:net'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let pendingScreenResolve: ((id: string | null) => void) | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 940, minHeight: 560,
    backgroundColor: '#090C0A', title: 'Holzcord', icon: path.join(__dirname, '../build/icon.png'),
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

// ---- Previa de links (titulo, descricao e imagem). So http/https e nunca enderecos de rede interna.
function isPrivateIp(ip: string): boolean {
  if (nodeNet.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (nodeNet.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:') }
  return true
}
const previewCache = new Map<string, unknown>()
const meta = (html: string, keys: string[]) => {
  for (const k of keys) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i')) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i'))
    if (m?.[1]) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
  }
  return ''
}
async function fetchPreview(url0: string) {
  if (previewCache.has(url0)) return previewCache.get(url0)
  let url = url0
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    const addrs = await dns.lookup(u.hostname, { all: true })
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) return null
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      const res = await net.fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 Holzcord-LinkPreview', accept: 'text/html' } })
      if (res.status >= 300 && res.status < 400) { const loc = res.headers.get('location'); if (!loc) return null; url = new URL(loc, url).toString(); continue }
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html') || !res.body) return null
      const reader = res.body.getReader(); const dec = new TextDecoder(); let html = ''
      while (html.length < 400_000) { const { done, value } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }) }
      reader.cancel().catch(() => {})
      const title = meta(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim()
      if (!title) return null
      let image = meta(html, ['og:image', 'twitter:image'])
      try { image = image ? new URL(image, url).toString() : ''; if (!/^https?:/.test(image)) image = '' } catch { image = '' }
      const out = { url: url0, title: title.slice(0, 120), description: meta(html, ['og:description', 'description', 'twitter:description']).slice(0, 220), image, site: meta(html, ['og:site_name']) || new URL(url).hostname }
      previewCache.set(url0, out); return out
    } finally { clearTimeout(timer) }
  }
  return null
}
ipcMain.handle('link:preview', async (_e, url: string) => { try { return await fetchPreview(String(url)) } catch { return null } })

// Push-to-talk global
function registerPtt(accelerator: string | null) {
  globalShortcut.unregisterAll()
  if (!accelerator) return
  try { globalShortcut.register(accelerator, () => win?.webContents.send('ptt:toggle')) } catch { /* atalho invalido */ }
}

app.whenReady().then(async () => {
  setupPermissions(); setupScreenShare(); createWindow()
  ipcMain.handle('ptt:set', (_e, acc: string | null) => registerPtt(acc))
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../build/icon.png')).resize({ width: 16, height: 16 }))
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
