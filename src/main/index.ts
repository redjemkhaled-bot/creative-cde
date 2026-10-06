import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import type { Project, VideoInfo } from '@core/types'
import { addProducts, createBrand, listBrands, userBrandsRoot, type NewBrandSpec } from './brands'
import { cancelExport, extractPcm, finishExport, nextFrame, nextVersionPath, startExport, writeFrame, type ExportKind } from './export'
import { killAll } from './ffmpeg'
import { detectDeadTail, makeProxy, probe } from './media'
import { autosave, loadAutosave, loadProject, saveProject } from './project'
import { handleMediaProtocol, registerSchemePrivileges } from './protocol'

registerSchemePrivileges()

// Command line: `--open <video>` or `--project <file.reel.json>` (handy for testing).
const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : null
}
const openArg = arg('--open')
const projectArg = arg('--project') ?? process.argv.slice(1).find((a) => /\.reel\.json$|\.project\.json$/i.test(a)) ?? null

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 680,
    title: 'Reel Captioner',
    backgroundColor: '#14161a',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  if (process.env.RC_SCREENSHOT) win.webContents.on('console-message', (e) => console.log('[renderer]', e.message))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

const handle = <A extends unknown[], R>(ch: string, fn: (...a: A) => R) =>
  ipcMain.handle(ch, (_e, ...a) => fn(...(a as A)))

// ---- video
handle('video:pick', async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: 'Open vertical video',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v'] }]
  })
  return r.canceled ? null : r.filePaths[0]
})
handle('video:probe', (path: string) => probe(path))
handle('video:deadTail', (info: VideoInfo) => detectDeadTail(info))
ipcMain.handle('video:proxy', (e, info: VideoInfo) => makeProxy(info, (p) => e.sender.send('video:proxyProgress', p)))
handle('audio:pcm', (path: string) => extractPcm(path))

// ---- startup / test hooks
handle('app:initial', () => ({
  video: openArg,
  project: projectArg,
  time: Number(process.env.RC_TIME ?? 0),
  play: !!process.env.RC_PLAY,
  demo: !!process.env.RC_DEMO,
  exportTo: process.env.RC_EXPORT ?? null,
  exportKind: (process.env.RC_EXPORT_KIND ?? 'mp4') as ExportKind
}))

// ---- projects
handle('project:pickOpen', async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: 'Open project',
    properties: ['openFile'],
    filters: [{ name: 'Reel project', extensions: ['json'] }]
  })
  return r.canceled ? null : r.filePaths[0]
})
handle('project:pickSave', async (suggested: string) => {
  const r = await dialog.showSaveDialog(win!, {
    title: 'Save project',
    defaultPath: suggested,
    filters: [{ name: 'Reel project', extensions: ['reel.json'] }]
  })
  return r.canceled ? null : r.filePath
})
handle('project:load', (path: string) => loadProject(path))
handle('project:save', (path: string, p: Project) => saveProject(path, p))
handle('project:autosave', (p: Project, projectPath: string | null) => autosave(p, projectPath))
handle('project:loadAutosave', () => loadAutosave())

// ---- brands
handle('brands:list', () => listBrands())
handle('brands:create', (spec: NewBrandSpec) => createBrand(spec))
handle('brands:addProducts', (dir: string, files: string[]) => addProducts(dir, files))
handle('brands:openFolder', (dir: string | null) => {
  const d = dir ?? userBrandsRoot()
  mkdirSync(d, { recursive: true })
  return shell.openPath(d)
})

// ---- generic file helpers
handle('dialog:pickFiles', async (title: string, exts: string[], multi: boolean) => {
  const r = await dialog.showOpenDialog(win!, {
    title,
    properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: exts.join(', ').toUpperCase(), extensions: exts }]
  })
  return r.canceled ? [] : r.filePaths
})
handle('dialog:pickFolder', async (title: string) => {
  const r = await dialog.showOpenDialog(win!, { title, properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
handle('fs:writeText', (path: string, text: string) => writeFileSync(path, text, 'utf8'))
handle('fs:exists', (path: string) => existsSync(path))
handle('shell:showItem', (path: string) => shell.showItemInFolder(path))

// ---- export
handle('export:suggest', (dir: string, name: string, ext: string) => nextVersionPath(dir, name, ext))
handle('export:start', (p: Project, kind: ExportKind, out: string) => startExport(p, kind, out))
handle('export:next', () => nextFrame())
handle('export:write', (data: Uint8Array) => writeFrame(data))
handle('export:finish', () => finishExport())
handle('export:cancel', () => cancelExport())
handle('path:dirname', (p: string) => dirname(p))

// Test hook: RC_SCREENSHOT=out.png saves a screenshot once the renderer is idle, then quits.
ipcMain.on('app:idle', async () => {
  const out = process.env.RC_SCREENSHOT
  if (!out || !win) return
  await new Promise((r) => setTimeout(r, process.env.RC_PLAY ? 2500 : 800))
  // RC_EVAL runs a test script in the page first and prints its result.
  if (process.env.RC_EVAL) console.log('EVAL_RESULT', JSON.stringify(await win.webContents.executeJavaScript(process.env.RC_EVAL)))
  const img = await win.webContents.capturePage()
  writeFileSync(out, img.toPNG())
  // RC_FRAME=frame.png also saves the full-size 1080x1920 preview canvas.
  if (process.env.RC_FRAME) {
    const url: string = await win.webContents.executeJavaScript(
      "document.querySelector('.preview-canvas')?.toDataURL('image/png') ?? ''"
    )
    writeFileSync(process.env.RC_FRAME, Buffer.from(url.split(',')[1] ?? '', 'base64'))
  }
  app.quit()
})
ipcMain.on('app:quit', () => app.quit())

app.whenReady().then(() => {
  handleMediaProtocol()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('before-quit', () => {
  cancelExport()
  killAll()
})
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
