import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { listBrands } from './brands'
import { killAll } from './ffmpeg'
import { detectDeadTail, makeProxy, probe } from './media'
import { handleMediaProtocol, registerSchemePrivileges } from './protocol'
import type { VideoInfo } from '@core/types'

registerSchemePrivileges()

// `--open <file>` loads a video on start (handy for testing).
const openArg = (() => {
  const i = process.argv.indexOf('--open')
  return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : null
})()

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'Reel Captioner',
    backgroundColor: '#14161a',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  if (process.env.RC_SCREENSHOT) win.webContents.on('console-message', (e) => console.log('[renderer]', e.message))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('video:pick', async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: 'Open vertical video',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v'] }]
  })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('video:initial', () => openArg && { path: openArg, time: Number(process.env.RC_TIME ?? 0), play: !!process.env.RC_PLAY })
ipcMain.handle('video:probe', (_e, path: string) => probe(path))
ipcMain.handle('video:deadTail', (_e, info: VideoInfo) => detectDeadTail(info))
ipcMain.handle('video:proxy', (e, info: VideoInfo) =>
  makeProxy(info, (p) => e.sender.send('video:proxyProgress', p))
)
ipcMain.handle('brands:list', () => listBrands())

// Test hook: RC_SCREENSHOT=out.png makes the app save a screenshot once the
// renderer reports it is idle, then quit.
ipcMain.on('app:idle', async () => {
  const out = process.env.RC_SCREENSHOT
  if (!out || !win) return
  await new Promise((r) => setTimeout(r, process.env.RC_PLAY ? 2500 : 800))
  const img = await win.webContents.capturePage()
  writeFileSync(out, img.toPNG())
  app.quit()
})

app.whenReady().then(() => {
  handleMediaProtocol()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('before-quit', killAll)
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
