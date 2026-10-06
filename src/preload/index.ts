import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DeadTail, LoadedBrand, Project, VideoInfo } from '@core/types'
import type { NewBrandSpec } from '../main/brands'

type ExportKind = 'mp4' | 'overlay'
const inv = <T>(ch: string, ...a: unknown[]): Promise<T> => ipcRenderer.invoke(ch, ...a)

const api = {
  // video
  pickVideo: () => inv<string | null>('video:pick'),
  probe: (path: string) => inv<VideoInfo>('video:probe', path),
  deadTail: (info: VideoInfo) => inv<DeadTail>('video:deadTail', info),
  makeProxy: (info: VideoInfo, onProgress: (p: number) => void): Promise<string> => {
    const h = (_e: unknown, p: number) => onProgress(p)
    ipcRenderer.on('video:proxyProgress', h)
    return inv<string>('video:proxy', info).finally(() => ipcRenderer.off('video:proxyProgress', h))
  },
  pcm: (path: string) => inv<Uint8Array | null>('audio:pcm', path),
  /** Absolute path of a dropped File (Electron removed File.path). */
  pathForFile: (f: File): string => webUtils.getPathForFile(f),

  // startup
  initial: () =>
    inv<{ video: string | null; project: string | null; time: number; play: boolean; demo: boolean; exportTo: string | null; exportKind: ExportKind }>('app:initial'),

  // projects
  pickProjectOpen: () => inv<string | null>('project:pickOpen'),
  pickProjectSave: (suggested: string) => inv<string | null>('project:pickSave', suggested),
  loadProject: (path: string) => inv<Project>('project:load', path),
  saveProject: (path: string, p: Project) => inv<void>('project:save', path, p),
  autosave: (p: Project, projectPath: string | null) => inv<void>('project:autosave', p, projectPath),
  loadAutosave: () => inv<{ projectPath: string | null; project: Project } | null>('project:loadAutosave'),

  // brands
  listBrands: () => inv<LoadedBrand[]>('brands:list'),
  createBrand: (spec: NewBrandSpec) => inv<LoadedBrand[]>('brands:create', spec),
  addProducts: (dir: string, files: string[]) => inv<LoadedBrand[]>('brands:addProducts', dir, files),
  openBrandFolder: (dir: string | null) => inv<string>('brands:openFolder', dir),

  // files
  pickFiles: (title: string, exts: string[], multi = false) => inv<string[]>('dialog:pickFiles', title, exts, multi),
  pickFolder: (title: string) => inv<string | null>('dialog:pickFolder', title),
  writeText: (path: string, text: string) => inv<void>('fs:writeText', path, text),
  exists: (path: string) => inv<boolean>('fs:exists', path),
  showItem: (path: string) => inv<void>('shell:showItem', path),
  dirname: (path: string) => inv<string>('path:dirname', path),

  // export
  suggestExportPath: (dir: string, name: string, ext: string) => inv<string>('export:suggest', dir, name, ext),
  exportStart: (p: Project, kind: ExportKind, out: string) => inv<{ frames: number; sourceFrames: number }>('export:start', p, kind, out),
  exportNext: () => inv<Uint8Array | null>('export:next'),
  exportWrite: (data: Uint8ClampedArray | Uint8Array) => inv<void>('export:write', data),
  exportFinish: () => inv<string>('export:finish'),
  exportCancel: () => inv<void>('export:cancel'),

  idle: (): void => ipcRenderer.send('app:idle'),
  quit: (): void => ipcRenderer.send('app:quit')
}

export type Api = typeof api
export type { NewBrandSpec }
contextBridge.exposeInMainWorld('api', api)
