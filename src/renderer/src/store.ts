import { create } from 'zustand'
import { chunksFor, timingFor } from '@core/captions'
import type { AudioAnalysis } from '@core/audioAnalysis'
import { applyV1 } from '@core/demo'
import type { BrandImages } from '@core/effects'
import { tokenCount } from '@core/markup'
import { clamp, snapToFrame } from '@core/time'
import {
  newProject, reelEnd, type CaptionSettings, type DeadTail, type EndCardSettings, type LoadedBrand, type Project,
  type ReelEvent, type SfxSettings, type VideoInfo, type WatermarkSettings
} from '@core/types'

export type Status = { kind: 'idle' } | { kind: 'busy'; label: string; progress?: number } | { kind: 'error'; message: string } | { kind: 'info'; message: string }
export type SideTab = 'video' | 'captions' | 'events' | 'sound'

const HISTORY = 200
/** Edits with the same key within this window merge into one undo step (drags, typing). */
const COALESCE_MS = 900

interface State {
  project: Project
  projectPath: string | null
  /** Undo / redo stacks of whole projects (cheap: structural sharing). */
  past: Project[]
  future: Project[]
  lastKey: string | null
  lastAt: number

  brands: LoadedBrand[]
  images: BrandImages | null
  /** Bumped when fonts or images finish loading so the preview redraws. */
  assetsVersion: number
  analysis: AudioAnalysis | null
  deadTail: DeadTail | null

  /** Playhead in source-video seconds. */
  time: number
  playing: boolean
  speed: number
  tapping: boolean
  selectedEvent: string | null
  sideTab: SideTab
  sfxPreview: boolean
  showExport: boolean
  showBrandWizard: boolean
  status: Status

  // generic
  edit: (fn: (p: Project) => Project, key?: string) => void
  undo: () => void
  redo: () => void
  replaceProject: (p: Project, path: string | null) => void
  set: (patch: Partial<State>) => void
  setStatus: (s: Status) => void

  // video
  loadVideo: (info: VideoInfo, previewPath: string) => void
  setPreviewPath: (p: string) => void
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setInPoint: (t: number) => void
  setOutPoint: (t: number) => void

  // captions
  setScript: (script: string) => void
  setChunkTime: (chunk: number, field: 'start' | 'end', value: number | null) => void
  setTokenTime: (token: number, value: number | null, key?: string) => void
  clearTimes: () => void
  setCaptions: (c: Partial<CaptionSettings>) => void
  loadDemo: () => void
  tapStamp: () => void
  tapUndo: () => void

  // events
  addEvent: (e: ReelEvent) => void
  updateEvent: (id: string, patch: Partial<ReelEvent>, key?: string) => void
  removeEvent: (id: string) => void
  setEndCard: (patch: Partial<EndCardSettings>, key?: string) => void
  setWatermark: (patch: Partial<WatermarkSettings>) => void
  setSfx: (patch: Partial<SfxSettings>) => void
  setBrandId: (id: string) => void
}

export const useStore = create<State>((set, get) => ({
  project: newProject('redjem'),
  projectPath: null,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  brands: [],
  images: null,
  assetsVersion: 0,
  analysis: null,
  deadTail: null,
  time: 0,
  playing: false,
  speed: 1,
  tapping: false,
  selectedEvent: null,
  sideTab: 'video',
  sfxPreview: true,
  showExport: false,
  showBrandWizard: false,
  status: { kind: 'idle' },

  edit: (fn, key) => {
    const s = get()
    const next = fn(s.project)
    if (next === s.project) return
    const now = Date.now()
    const merge = key != null && key === s.lastKey && now - s.lastAt < COALESCE_MS
    set({
      project: next,
      past: merge ? s.past : [...s.past.slice(-HISTORY + 1), s.project],
      future: [],
      lastKey: key ?? null,
      lastAt: now
    })
  },
  undo: () => {
    const s = get()
    if (!s.past.length) return
    set({ project: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.project, ...s.future], lastKey: null })
  },
  redo: () => {
    const s = get()
    if (!s.future.length) return
    set({ project: s.future[0], future: s.future.slice(1), past: [...s.past, s.project], lastKey: null })
  },
  replaceProject: (project, projectPath) =>
    set({ project, projectPath, past: [], future: [], lastKey: null, time: project.inPoint, playing: false, tapping: false, selectedEvent: null, deadTail: null }),
  set: (patch) => set(patch),
  setStatus: (status) => set({ status }),

  loadVideo: (info, previewPath) => {
    const name = info.path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
    get().edit((p) => ({ ...p, name: p.name === 'Untitled' || !p.video ? name : p.name, video: info, previewPath, inPoint: 0, outPoint: info.duration }))
    set({ deadTail: null, time: 0, playing: false, analysis: null })
  },
  setPreviewPath: (previewPath) => set({ project: { ...get().project, previewPath } }),
  setTime: (t) => {
    const p = get().project
    const max = Math.max(p.video?.duration ?? 0, reelEnd(p))
    set({ time: clamp(t, 0, max) })
  },
  setPlaying: (playing) => set({ playing }),
  setInPoint: (t) =>
    get().edit((p) => ({ ...p, inPoint: snapToFrame(clamp(t, 0, p.outPoint - 0.5)) }), 'in'),
  setOutPoint: (t) =>
    get().edit((p) => ({ ...p, outPoint: clamp(snapToFrame(t), p.inPoint + 0.5, p.video?.duration ?? t) }), 'out'),

  setScript: (script) => get().edit((p) => ({ ...p, script }), 'script'),
  setChunkTime: (chunk, field, value) =>
    get().edit((p) => {
      const chunkTimes = p.chunkTimes.slice()
      while (chunkTimes.length <= chunk) chunkTimes.push({ start: null, end: null })
      chunkTimes[chunk] = { ...chunkTimes[chunk], [field]: value }
      return { ...p, chunkTimes }
    }, `chunk-${chunk}-${field}`),
  setTokenTime: (token, value, key) =>
    get().edit((p) => {
      const tokenTimes = p.tokenTimes.slice()
      while (tokenTimes.length <= token) tokenTimes.push(null)
      tokenTimes[token] = value
      return { ...p, tokenTimes }
    }, key),
  clearTimes: () => get().edit((p) => ({ ...p, chunkTimes: [], tokenTimes: [] })),
  setCaptions: (c) => get().edit((p) => ({ ...p, captions: { ...p.captions, ...c } }), `cap-${Object.keys(c).join()}`),
  loadDemo: () => {
    const brand = activeBrand(get())?.brand
    get().edit((p) => applyV1(p, brand?.services ?? []))
    set({ time: 0 })
  },
  tapStamp: () => {
    const s = get()
    const brand = activeBrand(s)?.brand
    if (!brand) return
    const n = tokenCount(chunksFor(s.project, brand))
    const tt = s.project.tokenTimes
    let i = 0
    while (i < n && tt[i] != null) i++
    if (i >= n) return
    const prev = i > 0 ? (tt[i - 1] as number) : -Infinity
    s.setTokenTime(i, Math.max(s.time, prev + 0.02))
  },
  tapUndo: () => {
    const s = get()
    const tt = s.project.tokenTimes
    for (let i = tt.length - 1; i >= 0; i--) {
      if (tt[i] != null) return s.setTokenTime(i, null)
    }
  },

  addEvent: (e) => {
    get().edit((p) => ({ ...p, events: [...p.events, e] }))
    set({ selectedEvent: e.id, sideTab: 'events' })
  },
  updateEvent: (id, patch, key) =>
    get().edit((p) => ({ ...p, events: p.events.map((e) => (e.id === id ? ({ ...e, ...patch } as ReelEvent) : e)) }), key ?? `ev-${id}-${Object.keys(patch).join()}`),
  removeEvent: (id) => {
    get().edit((p) => ({ ...p, events: p.events.filter((e) => e.id !== id) }))
    if (get().selectedEvent === id) set({ selectedEvent: null })
  },
  setEndCard: (patch, key) => get().edit((p) => ({ ...p, endCard: { ...p.endCard, ...patch } }), key ?? `ec-${Object.keys(patch).join()}`),
  setWatermark: (patch) => get().edit((p) => ({ ...p, watermark: { ...p.watermark, ...patch } }), `wm-${Object.keys(patch).join()}`),
  setSfx: (patch) => get().edit((p) => ({ ...p, sfx: { ...p.sfx, ...patch } }), `sfx-${Object.keys(patch).join()}`),
  setBrandId: (brandId) => get().edit((p) => ({ ...p, brandId }))
}))

export const activeBrand = (s: { brands: LoadedBrand[]; project: Project }): LoadedBrand | null =>
  s.brands.find((b) => b.brand.id === s.project.brandId) ?? s.brands[0] ?? null

/** Resolved caption timing for the current project (memoised in core). */
export const currentTiming = () => {
  const s = useStore.getState()
  const b = activeBrand(s)?.brand
  return b ? { chunks: chunksFor(s.project, b), timing: timingFor(s.project, b) } : { chunks: [], timing: [] }
}
