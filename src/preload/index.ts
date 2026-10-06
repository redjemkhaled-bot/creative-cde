import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DeadTail, LoadedBrand, VideoInfo } from '@core/types'

const api = {
  pickVideo: (): Promise<string | null> => ipcRenderer.invoke('video:pick'),
  initialVideo: (): Promise<{ path: string; time: number; play: boolean; demo: boolean } | null> => ipcRenderer.invoke('video:initial'),
  probe: (path: string): Promise<VideoInfo> => ipcRenderer.invoke('video:probe', path),
  deadTail: (info: VideoInfo): Promise<DeadTail> => ipcRenderer.invoke('video:deadTail', info),
  makeProxy: (info: VideoInfo, onProgress: (p: number) => void): Promise<string> => {
    const h = (_e: unknown, p: number) => onProgress(p)
    ipcRenderer.on('video:proxyProgress', h)
    return ipcRenderer.invoke('video:proxy', info).finally(() => ipcRenderer.off('video:proxyProgress', h))
  },
  /** Absolute path of a dropped File (Electron removed File.path). */
  pathForFile: (f: File): string => webUtils.getPathForFile(f),
  listBrands: (): Promise<LoadedBrand[]> => ipcRenderer.invoke('brands:list'),
  idle: (): void => ipcRenderer.send('app:idle')
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
