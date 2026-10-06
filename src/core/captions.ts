// Caption layer — port of render_token / layout_chunk / draw_captions in
// reference/render.py, with three presets: Pop (v1), Fade and Karaoke.

import { clamp01, easeOutBack, easeOutCubic } from './easing'
import { color, fontFamily, fontWeight } from './fonts'
import { layoutChunk, placeLine } from './layout'
import { parseScript, type Chunk, type Token } from './markup'
import { ctx2d, drawBlurred, makeCanvas, memo, paste, type Ctx2D, type Sprite } from './sprites'
import { resolveTiming, type TimedChunk } from './timing'
import { OUT_W, reelEnd, type Brand, type Project } from './types'

export const POP_IN = 0.2
export const FADE_OUT = 0.12
/** Captions stay up this long after the chunk's end, unless the next starts. */
export const LINGER = 0.35
const PAD = 40

// --- memoised derivations (pure functions of their inputs) -----------------

let parseKey = ''
let parsed: Chunk[] = []
export function chunksFor(project: Project, brand: Brand): Chunk[] {
  const key = `${brand.caption.uppercaseLatin}\u0000${project.script}`
  if (key !== parseKey) {
    parsed = parseScript(project.script, brand.caption.uppercaseLatin)
    parseKey = key
  }
  return parsed
}

let timingInputs: unknown[] = []
let timed: TimedChunk[] = []
export function timingFor(project: Project, brand: Brand): TimedChunk[] {
  const chunks = chunksFor(project, brand)
  const inputs = [chunks, project.chunkTimes, project.tokenTimes, project.inPoint, project.outPoint]
  if (inputs.some((v, i) => v !== timingInputs[i])) {
    timed = resolveTiming(chunks, project.chunkTimes, project.tokenTimes, project.inPoint, project.outPoint)
    timingInputs = inputs
  }
  return timed
}

/** When chunk i stops being fully visible (it then fades for FADE_OUT). */
export function hideTime(timing: TimedChunk[], i: number, project: Project): number {
  const next = i + 1 < timing.length ? timing[i + 1].start : project.endCard.enabled ? project.endCard.start : reelEnd(project) + 1
  return Math.min(next - 0.02, timing[i].end + LINGER)
}

// --- token sprites -------------------------------------------------------------

export function tokenFont(brand: Brand, t: Token): { font: string; size: number } {
  const role = t.arabic ? 'arabic' : 'latin'
  const base = brand.fonts[role].size ?? (t.arabic ? 84 : 70)
  const size = Math.floor(base * (t.keyword ? brand.caption.keywordScale : 1))
  return { size, font: `${fontWeight(brand, role)} ${size}px "${fontFamily(brand, role)}"` }
}

/** Text + navy stroke + soft shadow (+ gold glow for keywords). */
function tokenSprite(brand: Brand, t: Token, gold: boolean, version: number): Sprite & { inkW: number } {
  const key = `tok|${brand.id}|${version}|${t.text}|${t.keyword}|${t.arabic}|${gold}`
  return memo(key, () => {
    const { font } = tokenFont(brand, t)
    const sw = brand.caption.strokeWidth
    const probe = ctx2d(makeCanvas(4, 4))
    probe.font = font
    probe.direction = t.arabic ? 'rtl' : 'ltr'
    probe.textAlign = 'left'
    const m = probe.measureText(t.text)
    const inkW = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * sw
    const inkH = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2 * sw
    const w = inkW + 2 * PAD
    const h = inkH + 2 * PAD

    const base = makeCanvas(w, h)
    const b = ctx2d(base)
    b.font = font
    b.direction = t.arabic ? 'rtl' : 'ltr'
    b.textAlign = 'left'
    b.textBaseline = 'alphabetic'
    b.lineJoin = 'round'
    b.miterLimit = 2
    const x = PAD + sw + m.actualBoundingBoxLeft
    const y = PAD + sw + m.actualBoundingBoxAscent
    b.lineWidth = sw * 2
    b.strokeStyle = color(brand, brand.caption.stroke)
    b.strokeText(t.text, x, y)
    b.fillStyle = color(brand, gold ? brand.caption.keyword : brand.caption.fill)
    b.fillText(t.text, x, y)

    const out = makeCanvas(w, h)
    const o = ctx2d(out)
    drawBlurred(o, base, '#000', 14, 0.85, 0, 6)
    if (gold) drawBlurred(o, base, color(brand, brand.caption.keyword), 18, 0.55, 0, 0)
    o.drawImage(base, 0, 0)
    return Object.assign({ canvas: out, cx: w / 2, cy: h / 2 }, { inkW })
  }) as Sprite & { inkW: number }
}

interface Placed { token: Token; cx: number; cy: number }

const layoutCache = new Map<string, { placed: Placed[]; scale: number }>()
let fontVersion = 0
/** Call after fonts finish loading: cached measurements are stale. */
export const clearLayoutCache = (): void => {
  layoutCache.clear()
  fontVersion++
}

function placeChunk(chunk: Chunk, brand: Brand, centerY: number) {
  const key = `${brand.id}|${fontVersion}|${centerY}|${chunk.tokens.map((t) => (t.keyword ? '*' : '') + t.text).join(' ')}`
  const hit = layoutCache.get(key)
  if (hit) return hit
  const gap = brand.caption.wordGap ?? 26
  const lh = brand.caption.lineHeight ?? 118
  const widths = chunk.tokens.map((t) => tokenSprite(brand, t, t.keyword, fontVersion).inkW)
  const layout = layoutChunk(widths, gap, brand.caption.maxWidth)
  const s = layout.scale
  const y0 = centerY - ((layout.lines.length - 1) * lh * s) / 2
  const placed: Placed[] = []
  layout.lines.forEach((line, li) => {
    const xs = placeLine(line.tokens.map((k) => widths[k] * s), gap * s, OUT_W / 2, chunk.rtl)
    line.tokens.forEach((k, j) => placed.push({ token: chunk.tokens[k], cx: xs[j], cy: y0 + li * lh * s }))
  })
  // Keep logical order so placed[k] matches chunk.tokens[k].
  placed.sort((a, b) => a.token.index - b.token.index)
  const result = { placed, scale: s }
  layoutCache.set(key, result)
  return result
}

export function drawCaptions(ctx: Ctx2D, t: number, project: Project, brand: Brand): void {
  const chunks = chunksFor(project, brand)
  if (!chunks.length) return
  const timing = timingFor(project, brand)
  const centerY = project.captions.centerY ?? brand.caption.centerY
  const preset = project.captions.preset
  timing.forEach((tc, i) => {
    const hide = hideTime(timing, i, project)
    if (t < tc.start - 0.05 || t >= hide + FADE_OUT) return
    const fade = t < hide ? 1 : clamp01(1 - (t - hide) / FADE_OUT)
    const { placed, scale } = placeChunk(chunks[tc.index], brand, centerY)
    placed.forEach((p, k) => {
      const ts = tc.tokens[k].start
      const dt = t - ts
      if (preset === 'karaoke') {
        const next = k + 1 < tc.tokens.length ? tc.tokens[k + 1].start : hide
        const current = dt >= 0 && t < next
        paste(ctx, tokenSprite(brand, p.token, p.token.keyword || current, fontVersion), p.cx, p.cy, scale, fade)
        return
      }
      if (dt < 0) return
      const q = clamp01(dt / POP_IN)
      const sprite = tokenSprite(brand, p.token, p.token.keyword, fontVersion)
      if (preset === 'fade') {
        paste(ctx, sprite, p.cx, p.cy + (1 - easeOutCubic(q)) * 12, scale, q * fade)
        return
      }
      const s = 0.55 + 0.45 * easeOutBack(q)
      paste(ctx, sprite, p.cx, p.cy + (1 - easeOutCubic(q)) * 25, s * scale, clamp01(q * 3) * fade)
    })
  })
}
