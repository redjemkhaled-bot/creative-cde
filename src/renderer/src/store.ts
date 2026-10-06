import { create } from 'zustand'
import { clamp, snapToFrame } from '@core/time'
import { V1_CHUNK_TIMES, V1_SCRIPT } from '@core/demo'
import { newProject, type CaptionSettings, type DeadTail, type LoadedBrand, type Project, type VideoInfo } from '@core/types'

export type Status = { kind: 'idle' } | { kind: 'busy'; label: string; progress?: number } | { kind: 'error'; message: string }

interface State {
  project: Project
  brands: LoadedBrand[]
  deadTail: DeadTail | null
  /** Playhead in source-video seconds. */
  time: number
  playing: boolean
  status: Status
  setBrands: (b: LoadedBrand[]) => void
  setStatus: (s: Status) => void
  loadVideo: (info: VideoInfo, previewPath: string) => void
  setDeadTail: (d: DeadTail | null) => void
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setInPoint: (t: number) => void
  setOutPoint: (t: number) => void
  setPreviewPath: (p: string) => void
  /** Bumped when fonts finish loading so the preview redraws. */
  fontsVersion: number
  fontsLoaded: () => void
  setScript: (script: string) => void
  setChunkTime: (chunk: number, field: 'start' | 'end', value: number | null) => void
  clearChunkTimes: () => void
  setCaptions: (c: Partial<CaptionSettings>) => void
  loadDemoScript: () => void
}

const MIN_LEN = 0.5

export const useStore = create<State>((set, get) => ({
  project: newProject('redjem'),
  brands: [],
  deadTail: null,
  time: 0,
  playing: false,
  status: { kind: 'idle' },
  setBrands: (brands) => set({ brands }),
  setStatus: (status) => set({ status }),
  loadVideo: (info, previewPath) => {
    const name = info.path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
    set({
      project: { ...get().project, name, video: info, previewPath, inPoint: 0, outPoint: info.duration },
      deadTail: null,
      time: 0,
      playing: false
    })
  },
  setDeadTail: (deadTail) => set({ deadTail }),
  setTime: (t) => {
    const v = get().project.video
    set({ time: v ? clamp(t, 0, v.duration) : 0 })
  },
  setPlaying: (playing) => set({ playing }),
  setInPoint: (t) => {
    const p = get().project
    set({ project: { ...p, inPoint: snapToFrame(clamp(t, 0, p.outPoint - MIN_LEN)) } })
  },
  setOutPoint: (t) => {
    const p = get().project
    const max = p.video?.duration ?? 0
    set({ project: { ...p, outPoint: clamp(snapToFrame(t), p.inPoint + MIN_LEN, max) } })
  },
  setPreviewPath: (previewPath) => set({ project: { ...get().project, previewPath } }),
  fontsVersion: 0,
  fontsLoaded: () => set({ fontsVersion: get().fontsVersion + 1 }),
  setScript: (script) => set({ project: { ...get().project, script } }),
  setChunkTime: (chunk, field, value) => {
    const p = get().project
    const chunkTimes = p.chunkTimes.slice()
    while (chunkTimes.length <= chunk) chunkTimes.push({ start: null, end: null })
    chunkTimes[chunk] = { ...chunkTimes[chunk], [field]: value }
    set({ project: { ...p, chunkTimes } })
  },
  clearChunkTimes: () => set({ project: { ...get().project, chunkTimes: [], tokenTimes: [] } }),
  setCaptions: (c) => {
    const p = get().project
    set({ project: { ...p, captions: { ...p.captions, ...c } } })
  },
  loadDemoScript: () => {
    const p = get().project
    set({
      project: {
        ...p,
        script: V1_SCRIPT,
        chunkTimes: V1_CHUNK_TIMES.map(([start, end]) => ({ start, end })),
        tokenTimes: []
      }
    })
  }
}))

export const activeBrand = (s: State): LoadedBrand | null =>
  s.brands.find((b) => b.brand.id === s.project.brandId) ?? s.brands[0] ?? null
