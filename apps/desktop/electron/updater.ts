import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type UpdateStatus = {
  state: 'dev' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string; percent?: number; message?: string
}
let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'dev' }
const listeners = new Set<(s: UpdateStatus) => void>()
const emit = (s: UpdateStatus) => { status = s; listeners.forEach(l => l(s)) }
export const onStatus = (fn: (s: UpdateStatus) => void) => { listeners.add(fn); return () => listeners.delete(fn) }

type Updater = import('electron-updater').AppUpdater
let updater: Updater | null = null
async function getUpdater(): Promise<Updater> {
  if (updater) return updater
  const { autoUpdater } = await import('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', i => emit({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'none' }))
  autoUpdater.on('download-progress', p => emit({ state: 'downloading', percent: Math.round(p.percent), version: status.version }))
  autoUpdater.on('update-downloaded', i => emit({ state: 'ready', version: i.version }))
  autoUpdater.on('error', e => { if (status.state !== 'ready') emit({ state: 'error', message: String(e?.message ?? e).slice(0, 160) }) })
  updater = autoUpdater
  return autoUpdater
}

/** Procura uma versao nova (so no app instalado). O download comeca sozinho. */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return emit({ state: 'dev' })
  if (status.state === 'downloading' || status.state === 'ready') return
  try { await (await getUpdater()).checkForUpdates() } catch (e) { emit({ state: 'error', message: String((e as Error).message ?? e).slice(0, 160) }) }
}

/** Fecha o app, instala a versao baixada em silencio e reabre. */
export async function installNow(): Promise<void> {
  const u = await getUpdater();
  (app as unknown as { quitting: boolean }).quitting = true
  u.quitAndInstall(true, true)
}

export function startPeriodicChecks(everyMinutes = 20) {
  setInterval(() => { checkForUpdates() }, everyMinutes * 60_000)
}

export function registerUpdateIpc(getWin: () => BrowserWindow | null) {
  ipcMain.handle('update:get', () => ({ status, version: app.getVersion() }))
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:install', () => installNow())
  onStatus(s => getWin()?.webContents.send('update:status', s))
}

const launcherHtml = (logoB64: string) => `<!doctype html><meta charset=utf-8><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#1E1B18;color:#F0EAE0;font-family:'Segoe UI',system-ui,sans-serif;-webkit-app-region:drag;user-select:none;border:1px solid #3E3831;box-sizing:border-box">
<img src="data:image/png;base64,${logoB64}" width=84 height=84>
<div style="font:600 26px Georgia,serif">holzcord</div>
<div id=t style="font-size:14px;color:#A69D91;height:20px">Iniciando…</div>
<div style="width:240px;height:5px;border-radius:5px;background:#3E3831;overflow:hidden"><div id=b style="height:100%;width:30%;background:#E07A4E;border-radius:5px;transition:width .3s"></div></div>
<script>function setStatus(t,p){document.getElementById('t').textContent=t;var b=document.getElementById('b');if(p==null){b.style.width='30%'}else{b.style.width=Math.max(4,p)+'%'}}</script>`

/**
 * Janela de inicializacao estilo "launcher": procura atualizacao, baixa, instala e so entao deixa o app abrir.
 * Devolve uma funcao para fechar a janela (chamada depois que a janela principal existir).
 */
export async function runLauncher(): Promise<() => void> {
  if (!app.isPackaged) return () => {}
  let logo = ''
  try { logo = fs.readFileSync(path.join(__dirname, '../build/icon.png')).toString('base64') } catch { /* sem icone */ }
  const win = new BrowserWindow({ width: 380, height: 300, frame: false, resizable: false, show: false, backgroundColor: '#1E1B18', alwaysOnTop: true, skipTaskbar: false, title: 'Holzcord' })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(launcherHtml(logo)))
  win.show()
  const ui = (t: string, p: number | null = null) => win.webContents.executeJavaScript(`setStatus(${JSON.stringify(t)}, ${p})`).catch(() => {})
  const close = () => { if (!win.isDestroyed()) win.destroy() }

  await new Promise<void>(resolve => {
    let finished = false
    const done = () => { if (!finished) { finished = true; clearTimeout(timer); off(); resolve() } }
    const timer = setTimeout(done, 12_000) // sem internet ou GitHub fora do ar: abre mesmo assim
    const off = onStatus(s => {
      if (s.state === 'checking') ui('Procurando atualizações…')
      else if (s.state === 'none') { ui('Você já está com a versão mais recente.', 100); setTimeout(done, 500) }
      else if (s.state === 'available') { clearTimeout(timer); ui(`Baixando a versão ${s.version}…`, 5) }
      else if (s.state === 'downloading') ui(`Baixando a atualização… ${s.percent ?? 0}%`, s.percent ?? 0)
      else if (s.state === 'ready') { ui('Instalando a atualização…', 100); setTimeout(() => { installNow() }, 900) }
      else if (s.state === 'error') { ui('Abrindo o Holzcord…'); setTimeout(done, 400) }
    })
    checkForUpdates().then(() => { if (status.state === 'idle') done() })
  })
  return close
}
