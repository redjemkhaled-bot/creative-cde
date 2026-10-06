import { create } from 'zustand'
import { clamp, snapToFrame } from '@core/time'
import { newProject, type DeadTail, type LoadedBrand, type Project, type VideoInfo } from '@core/types'

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
  setPreviewPath: (previewPath) => set({ project: { ...get().project, previewPath } })
}))

export const activeBrand = (s: State): LoadedBrand | null =>
  s.brands.find((b) => b.brand.id === s.project.brandId) ?? s.brands[0] ?? null
