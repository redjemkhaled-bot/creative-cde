// Shared data model. Everything brand-specific comes from Brand; everything
// reel-specific comes from Project. Components must not hard-code either.

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
    /** Optional: distance between the two lines, px. */
    lineHeight?: number
    /** Optional: space between words, px. */
    wordGap?: number
  }
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

export interface Project {
  version: 1
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
}

export function newProject(brandId: string): Project {
  return {
    version: 1, name: 'Untitled', brandId, video: null, previewPath: null, inPoint: 0, outPoint: 0,
    script: '', chunkTimes: [], tokenTimes: [], captions: { preset: 'pop', centerY: null }
  }
}
