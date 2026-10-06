import { OUT_FPS } from './types'

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Snap a time to the nearest output frame boundary. */
export const snapToFrame = (t: number, fps = OUT_FPS): number => Math.round(t * fps) / fps

/** 12.345 -> "00:12.35" */
export function formatTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

/** Parse ffprobe's "30000/1001" style frame rate. */
export function parseRate(r: string | undefined): number {
  if (!r) return 0
  const [n, d] = r.split('/').map(Number)
  if (!d) return n || 0
  return n / d
}
