// Shared data model. Everything brand-specific comes from Brand; everything
// reel-specific comes from Project. Components must not hard-code either.
// All times are in source-video seconds; positions are in 1080x1920 output px.

export const OUT_W = 1080
export const OUT_H = 1920
export const OUT_FPS = 30

export interface FontSpec {
  file: string
  size?: number
  weight?: number
}

export interface Brand {
  id: string
  name: string
  colors: Record<string, string>
  fonts: { latin: FontSpec; latin2?: FontSpec; arabic: FontSpec }
  caption: {
    /** Colour names refer to brand.colors; anything else is used as-is. */
    fill: string
    keyword: string
    stroke: string
    strokeWidth: number
    keywordScale: number
    uppercaseLatin: boolean
    centerY: number
    maxWidth: number
    /** Distance between the two caption lines, px (v1: 118). */
    lineHeight?: number
    /** Space between words, px (v1: 26). */
    wordGap?: number
  }
  /** `svg` may be any image file (SVG or PNG) relative to the brand folder. */
  logo: { svg: string }
  pattern: string
  handle: string
  phone: string
  website: string
  endCard: { taglineTop: string; taglineBottom: string }
  services: string[]
}

/** A brand as loaded by the main process: brand.json plus its folder on disk. */
export interface LoadedBrand {
  dir: string
  brand: Brand
  products: string[]
  /** Bundled with the app (read-only) or created by the user. */
  builtIn: boolean
}

export interface VideoInfo {
  path: string
  duration: number
  width: number
  height: number
  fps: number
  codec: string
  hasAudio: boolean
}

export interface DeadTail {
  /** Proposed out-point in seconds, or null when the video has no dead tail. */
  outPoint: number | null
  blackStart: number | null
  silenceStart: number | null
}

export type CaptionPreset = 'pop' | 'fade' | 'karaoke'

export interface CaptionSettings {
  preset: CaptionPreset
  /** Overrides brand.caption.centerY when set. */
  centerY: number | null
}

// ---------------------------------------------------------------- events

/** -1 enters from the left, 1 from the right. */
export type Side = -1 | 1

interface EventBase {
  id: string
  start: number
  end: number
}

export interface ProductEvent extends EventBase {
  type: 'product'
  /** File name inside brands/<brand>/products/. */
  product: string
  width: number
  x: number
  y: number
  side: Side
  /** Resting rotation, degrees. */
  rotation: number
}

/** Quick zoom in and out; `end - start` is the duration. */
export interface ZoomPunchEvent extends EventBase {
  type: 'zoomPunch'
  amount: number
  centerY: number
}

/** Ramp in, hold, ramp out. */
export interface ZoomHoldEvent extends EventBase {
  type: 'zoomHold'
  amount: number
  centerY: number
  ramp: number
}

export interface CardEvent extends EventBase {
  type: 'card'
  x: number
  y: number
  /** Up to 3 product files shown as thumbnails. */
  products: string[]
  label: string
}

export interface PillEvent extends EventBase {
  type: 'pill'
  x: number
  y: number
  text: string
}

export interface SparklesEvent extends EventBase {
  type: 'sparkles'
  seed: number
  count: number
}

export interface LogoCardEvent extends EventBase {
  type: 'logoCard'
  x: number
  y: number
  /** Logo width inside the card, px. */
  width: number
}

export type ReelEvent = ProductEvent | ZoomPunchEvent | ZoomHoldEvent | CardEvent | PillEvent | SparklesEvent | LogoCardEvent
export type EventType = ReelEvent['type']

export interface EndCardProduct {
  product: string
  width: number
  x: number
  y: number
  side: Side
  rotation: number
  delay: number
}

export interface EndCardSettings {
  enabled: boolean
  start: number
  /** Seconds from the end card's start to the end of the reel. */
  hold: number
  products: EndCardProduct[]
}

export interface WatermarkSettings {
  enabled: boolean
  y: number
  opacity: number
}

export interface SfxSettings {
  enabled: boolean
  /** Multipliers on the default pop / whoosh gains. */
  popVolume: number
  whooshVolume: number
  /** Optional custom WAV files replacing the generated sounds. */
  popFile: string | null
  whooshFile: string | null
}

// ---------------------------------------------------------------- project

export interface Project {
  version: 2
  name: string
  brandId: string
  video: VideoInfo | null
  /** Path the preview plays; differs from video.path when a proxy was made. */
  previewPath: string | null
  inPoint: number
  outPoint: number
  /** Raw script with markup (*keyword*, |, line breaks). */
  script: string
  /** Per chunk (by position): optional start/end in source seconds. */
  chunkTimes: { start: number | null; end: number | null }[]
  /** Per token (by global index): tapped start time in source seconds. */
  tokenTimes: (number | null)[]
  captions: CaptionSettings
  events: ReelEvent[]
  endCard: EndCardSettings
  watermark: WatermarkSettings
  sfx: SfxSettings
}

export function newProject(brandId: string): Project {
  return {
    version: 2,
    name: 'Untitled',
    brandId,
    video: null,
    previewPath: null,
    inPoint: 0,
    outPoint: 0,
    script: '',
    chunkTimes: [],
    tokenTimes: [],
    captions: { preset: 'pop', centerY: null },
    events: [],
    endCard: { enabled: false, start: 0, hold: 2.1, products: [] },
    watermark: { enabled: true, y: 330, opacity: 0.9 },
    sfx: { enabled: true, popVolume: 1, whooshVolume: 1, popFile: null, whooshFile: null }
  }
}

/** Fill in fields missing from older or hand-written project files. */
export function normalizeProject(p: Partial<Project> & Record<string, unknown>): Project {
  const d = newProject(String(p.brandId ?? 'redjem'))
  return {
    ...d,
    ...p,
    version: 2,
    captions: { ...d.captions, ...(p.captions ?? {}) },
    endCard: { ...d.endCard, ...(p.endCard ?? {}) },
    watermark: { ...d.watermark, ...(p.watermark ?? {}) },
    sfx: { ...d.sfx, ...(p.sfx ?? {}) },
    events: Array.isArray(p.events) ? p.events : [],
    chunkTimes: Array.isArray(p.chunkTimes) ? p.chunkTimes : [],
    tokenTimes: Array.isArray(p.tokenTimes) ? p.tokenTimes : []
  } as Project
}

/** Last instant of the reel in source time (end card hold included). */
export const reelEnd = (p: Project): number => (p.endCard.enabled ? Math.max(p.endCard.start + p.endCard.hold, p.inPoint + 0.1) : p.outPoint)

/** Number of output frames. */
export const frameCount = (p: Project): number => Math.max(1, Math.round((reelEnd(p) - p.inPoint) * OUT_FPS))

let idCounter = 0
export const newId = (prefix = 'ev'): string => `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`
