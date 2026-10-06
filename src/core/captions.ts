// Caption layer: word-by-word animated captions (Pop / Fade / Karaoke).

import type { Ctx2D } from './drawFrame'
import { clamp01, easeOutBack, easeOutCubic } from './easing'
import { color, fontFamily, fontWeight } from './fonts'
import { layoutChunk, placeLine } from './layout'
import { parseScript, type Chunk, type Token } from './markup'
import { resolveTiming, type TimedChunk } from './timing'
import { OUT_W, type Brand, type Project } from './types'

export const POP_IN = 0.2
export const FADE_OUT = 0.12

interface PlacedToken { token: Token; x: number; baseline: number; width: number; size: number; font: string }
interface PlacedChunk { chunk: Chunk; tokens: PlacedToken[]; scale: number }

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

const layoutCache = new Map<string, PlacedChunk>()
/** Call after fonts finish loading: cached measurements are stale. */
export const clearLayoutCache = (): void => layoutCache.clear()

function tokenFont(brand: Brand, t: Token): { font: string; size: number } {
  const role = t.arabic ? 'arabic' : 'latin'
  const base = brand.fonts[role].size ?? (t.arabic ? 84 : 70)
  const size = base * (t.keyword ? brand.caption.keywordScale : 1)
  return { size, font: `${fontWeight(brand, role)} ${size.toFixed(2)}px "${fontFamily(brand, role)}"` }
}

function placeChunk(ctx: Ctx2D, chunk: Chunk, brand: Brand, centerY: number): PlacedChunk {
  const key = `${brand.id}|${centerY}|${chunk.tokens.map((t) => (t.keyword ? '*' : '') + t.text).join(' ')}`
  const hit = layoutCache.get(key)
  if (hit) return hit
  const c = brand.caption
  const latinSize = brand.fonts.latin.size ?? 70
  const arabicSize = brand.fonts.arabic.size ?? 84
  const gap = c.wordGap ?? Math.round(latinSize * 0.3)
  const lineH = c.lineHeight ?? Math.round(Math.max(latinSize, arabicSize) * 1.22)

  const fonts = chunk.tokens.map((t) => tokenFont(brand, t))
  const widths = chunk.tokens.map((t, i) => {
    ctx.font = fonts[i].font
    ctx.direction = t.arabic ? 'rtl' : 'ltr'
    return ctx.measureText(t.text).width
  })
  ctx.direction = 'ltr'
  const layout = layoutChunk(widths, gap, c.maxWidth)
  const s = layout.scale
  const placed: PlacedToken[] = []
  layout.lines.forEach((line, li) => {
    const lineCenter = centerY + (li - (layout.lines.length - 1) / 2) * lineH * s
    // Baseline sits a bit below the line centre so Latin caps look centred.
    const baseline = lineCenter + latinSize * 0.36 * s
    const ws = line.tokens.map((k) => widths[k] * s)
    const xs = placeLine(ws, gap * s, OUT_W / 2, chunk.rtl)
    line.tokens.forEach((k, j) => {
      placed.push({ token: chunk.tokens[k], x: xs[j], baseline, width: ws[j], size: fonts[k].size * s, font: fonts[k].font })
    })
  })
  const result = { chunk, tokens: placed, scale: s }
  layoutCache.set(key, result)
  return result
}

// --- drawing -----------------------------------------------------------------

function drawToken(ctx: Ctx2D, brand: Brand, p: PlacedToken, scale: number, dy: number, alpha: number, gold: boolean) {
  if (alpha <= 0.001) return
  const c = brand.caption
  const cx = p.x + p.width / 2
  const cy = p.baseline - p.size * 0.36
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy + dy)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -cy)
  ctx.font = p.font
  if (p.token.arabic) ctx.direction = 'rtl'
  ctx.textAlign = p.token.arabic ? 'right' : 'left'
  const x = p.token.arabic ? p.x + p.width : p.x
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  const fill = color(brand, gold ? c.keyword : c.fill)

  // Soft drop shadow under the stroked text.
  ctx.shadowColor = 'rgba(0,0,0,0.85)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 6
  ctx.lineWidth = c.strokeWidth * 2
  ctx.strokeStyle = color(brand, c.stroke)
  ctx.strokeText(p.token.text, x, p.baseline)
  // Keyword glow.
  if (gold) {
    ctx.shadowColor = hexA(color(brand, c.keyword), 0.55)
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 0
    ctx.fillStyle = fill
    ctx.fillText(p.token.text, x, p.baseline)
  }
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeText(p.token.text, x, p.baseline)
  ctx.fillStyle = fill
  ctx.fillText(p.token.text, x, p.baseline)
  ctx.restore()
}

function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

export function drawCaptions(ctx: Ctx2D, t: number, project: Project, brand: Brand): void {
  const chunks = chunksFor(project, brand)
  if (!chunks.length) return
  const timing = timingFor(project, brand)
  const centerY = project.captions.centerY ?? brand.caption.centerY
  const preset = project.captions.preset
  for (const tc of timing) {
    if (t < tc.start || t >= tc.end) continue
    const placed = placeChunk(ctx, chunks[tc.index], brand, centerY)
    const chunkAlpha = clamp01((tc.end - t) / FADE_OUT)
    placed.tokens.forEach((p, k) => {
      const ts = tc.tokens[k].start
      const next = k + 1 < tc.tokens.length ? tc.tokens[k + 1].start : tc.end
      const dt = t - ts
      if (preset === 'karaoke') {
        const current = dt >= 0 && t < next
        drawToken(ctx, brand, p, 1, 0, chunkAlpha, p.token.keyword || current)
        return
      }
      if (dt < 0) return
      const x = dt / POP_IN
      if (preset === 'fade') {
        drawToken(ctx, brand, p, 1, 12 * (1 - easeOutCubic(x)), clamp01(x) * chunkAlpha, p.token.keyword)
        return
      }
      const scale = 0.55 + 0.45 * easeOutBack(x)
      const dy = 25 * (1 - easeOutCubic(x))
      drawToken(ctx, brand, p, scale, dy, clamp01(x * 3) * chunkAlpha, p.token.keyword)
    })
  }
}
