// Generated sound effects (render.py make_sfx): a pitch-swept "pop" on every
// entry and a filtered-noise "whoosh" on zooms and the end card.

import { END_CARD_ITEM_DELAYS } from './effects'
import { gaussian, mulberry32 } from './rng'
import type { Project } from './types'

export const SFX_RATE = 44100

export interface SfxCue { t: number; kind: 'pop' | 'whoosh'; gain: number; dur: number }

/** When each sound plays, in source seconds. */
export function sfxCues(p: Project): SfxCue[] {
  const cues: SfxCue[] = []
  const pop = (t: number, gain: number) => cues.push({ t, kind: 'pop', gain, dur: 0.09 })
  const whoosh = (t: number, dur: number, gain: number) => cues.push({ t, kind: 'whoosh', gain, dur })
  for (const e of p.events) {
    if (e.type === 'product') pop(e.start, 0.22)
    else if (e.type === 'pill') pop(e.start, 0.16)
    else if (e.type === 'card' || e.type === 'logoCard') pop(e.start, 0.25)
    else if (e.type === 'zoomPunch') whoosh(e.start, e.end - e.start + 0.1, 0.18)
    else if (e.type === 'zoomHold') whoosh(e.start, 0.4, 0.2)
  }
  if (p.endCard.enabled) {
    whoosh(p.endCard.start - 0.05, 0.6, 0.25)
    for (const d of END_CARD_ITEM_DELAYS) pop(p.endCard.start + d, 0.18)
  }
  return cues.sort((a, b) => a.t - b.t)
}

export function synthPop(rate = SFX_RATE): Float32Array {
  const n = Math.floor(0.09 * rate)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / rate
    phase += (2 * Math.PI * (900 * Math.exp(-t * 25) + 300)) / rate
    out[i] = Math.sin(phase) * Math.exp(-t * 40)
  }
  return out
}

export function synthWhoosh(dur: number, rate = SFX_RATE): Float32Array {
  const m = Math.max(2, Math.floor(dur * rate))
  const g = gaussian(mulberry32(1))
  const nz = Float32Array.from({ length: m }, g)
  // Moving average of 30 samples ("same" length, centred) = gentle low-pass.
  const k = 30
  const half = Math.floor(k / 2)
  const prefix = new Float64Array(m + 1)
  for (let i = 0; i < m; i++) prefix[i + 1] = prefix[i] + nz[i]
  const out = new Float32Array(m)
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(m, i - half + k)
    const env = Math.sin((Math.PI * i) / (m - 1)) ** 2
    out[i] = ((prefix[b] - prefix[a]) / k) * env * 3
  }
  return out
}

export interface CustomSounds { pop?: Float32Array | null; whoosh?: Float32Array | null }

/**
 * Mono SFX track covering [from, to) source seconds. Index 0 = `from`.
 * Custom sounds (decoded at SFX_RATE) replace the generated ones.
 */
export function renderSfx(p: Project, from: number, to: number, custom: CustomSounds = {}, rate = SFX_RATE): Float32Array {
  const n = Math.max(1, Math.round((to - from) * rate))
  const out = new Float32Array(n)
  if (!p.sfx.enabled) return out
  const pop = custom.pop ?? synthPop(rate)
  const whooshes = new Map<number, Float32Array>()
  for (const c of sfxCues(p)) {
    const sig = c.kind === 'pop' ? pop : custom.whoosh ?? whooshes.get(c.dur) ?? whooshes.set(c.dur, synthWhoosh(c.dur, rate)).get(c.dur)!
    const gain = c.gain * (c.kind === 'pop' ? p.sfx.popVolume : p.sfx.whooshVolume)
    const i0 = Math.floor((c.t - from) * rate)
    for (let k = 0; k < sig.length; k++) {
      const i = i0 + k
      if (i >= 0 && i < n) out[i] += sig[k] * gain
    }
  }
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]))
  return out
}

/** 16-bit PCM stereo WAV from a mono float track. */
export function encodeWav(mono: Float32Array, rate = SFX_RATE): Uint8Array {
  const n = mono.length
  const buf = new ArrayBuffer(44 + n * 4)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true)
  v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true)
  for (let i = 0; i < n; i++) {
    const s = Math.round(mono[i] * 32767)
    v.setInt16(44 + i * 4, s, true)
    v.setInt16(46 + i * 4, s, true)
  }
  return new Uint8Array(buf)
}
