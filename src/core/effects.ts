// Overlay effects — ports of the draw_* functions in reference/render.py.
// Every function is pure: output depends only on (t, data, brand, images).

import { clamp01, easeInOutSine, easeOutBack, easeOutCubic } from './easing'
import { fontFamily, fontWeight } from './fonts'
import { mulberry32 } from './rng'
import {
  ctx2d, drawBlurred, makeCanvas, memo, paste, resizeToWidth, rounded, roundRectPath, trim, withShadow,
  type AnyCanvas, type Ctx2D, type ImageLike, type Sprite
} from './sprites'
import {
  OUT_H, OUT_W, type Brand, type CardEvent, type EndCardSettings, type LogoCardEvent, type PillEvent,
  type ProductEvent, type ReelEvent, type SparklesEvent, type WatermarkSettings
} from './types'

export interface BrandImages {
  /** Keyed by product file name. */
  products: Map<string, ImageLike>
  pattern: ImageLike | null
  logo: ImageLike | null
  /** Changes whenever images are reloaded; part of every sprite cache key. */
  version: number
}

const TAU = Math.PI * 2

/** Brand colour by role, falling back to the v1 palette only if missing. */
const bc = (brand: Brand, role: 'navy' | 'mint' | 'gold' | 'white'): string =>
  brand.colors[role] ?? { navy: '#112335', mint: '#87C9B7', gold: '#F2C83F', white: '#FFFFFF' }[role]

const latinFont = (brand: Brand, size: number, role: 'latin' | 'latin2' = 'latin'): string =>
  `${fontWeight(brand, brand.fonts[role] ? role : 'latin')} ${size}px "${fontFamily(brand, brand.fonts[role] ? role : 'latin')}"`

/** render.py anim_in_out: phase and progress, or null when not visible. */
export function animInOut(t: number, tIn: number, tOut: number, din = 0.38, dout = 0.25): ['in' | 'hold' | 'out', number] | null {
  if (t < tIn || t > tOut + dout) return null
  if (t < tIn + din) return ['in', (t - tIn) / din]
  if (t > tOut) return ['out', (t - tOut) / dout]
  return ['hold', 1]
}

// ---------------------------------------------------------------- products

export function productSprite(images: BrandImages, file: string, width: number): Sprite | null {
  const img = images.products.get(file)
  if (!img) return null
  return memo(`prod|${images.version}|${file}|${width}`, () => {
    const im = resizeToWidth(trim(img), Math.round(width))
    const pad = 40
    const c = makeCanvas(im.width + 2 * pad, im.height + 2 * pad)
    const x = ctx2d(c)
    const placed = makeCanvas(c.width, c.height)
    ctx2d(placed).drawImage(im, pad, pad)
    drawBlurred(x, placed, '#000', 16, 0.55, 8, 18)
    x.drawImage(im, pad, pad)
    return { canvas: c, cx: c.width / 2, cy: c.height / 2 }
  })
}

export function drawProduct(ctx: Ctx2D, t: number, e: ProductEvent, images: BrandImages): void {
  const st = animInOut(t, e.start, e.end)
  if (!st) return
  const spr = productSprite(images, e.product, e.width)
  const [ph, p] = st
  const bob = 14 * Math.sin((TAU * (t - e.start)) / 1.7)
  const sway = 3 * Math.sin((TAU * (t - e.start)) / 2.3)
  if (ph === 'in') {
    const s = 0.25 + 0.75 * easeOutBack(p)
    const xx = e.x + e.side * (1 - easeOutCubic(p)) * 260
    paste(ctx, spr, xx, e.y + bob, s, clamp01(p * 2.5), e.rotation + sway + e.side * (1 - p) * 25)
  } else if (ph === 'out') {
    paste(ctx, spr, e.x, e.y + bob, 1 - 0.6 * p, 1 - p, e.rotation + sway)
  } else {
    paste(ctx, spr, e.x, e.y + bob, 1, 1, e.rotation + sway)
  }
}

// ---------------------------------------------------------------- UI card

function patternTile(images: BrandImages, w: number, h: number, brand: Brand): AnyCanvas {
  const c = makeCanvas(w, h)
  const x = ctx2d(c)
  if (images.pattern) x.drawImage(images.pattern.image, 0, 0, w, h)
  else {
    x.fillStyle = bc(brand, 'mint')
    x.fillRect(0, 0, w, h)
  }
  return c
}

function cardSprites(e: CardEvent, brand: Brand, images: BrandImages): { card: Sprite; badge: Sprite } {
  const key = `card|${images.version}|${brand.id}|${e.products.join(',')}|${e.label}`
  const card = memo(key, () => {
    const cw = 800, ch = 360
    const c = rounded(cw, ch, 44, 'rgba(255,255,255,0.98)')
    const cx = ctx2d(c)
    const tw = 228, th = 270
    e.products.slice(0, 3).forEach((file, i) => {
      const tile = patternTile(images, tw, th, brand)
      const tx = ctx2d(tile)
      tx.globalCompositeOperation = 'destination-in'
      tx.drawImage(rounded(tw, th, 26, '#000'), 0, 0)
      tx.globalCompositeOperation = 'source-over'
      const img = images.products.get(file)
      if (img) {
        const pr = trim(img)
        const sc = Math.min((tw - 30) / pr.width, (th - 40) / pr.height)
        const w = Math.round(pr.width * sc), h = Math.round(pr.height * sc)
        tx.imageSmoothingQuality = 'high'
        tx.drawImage(pr, Math.floor((tw - w) / 2), Math.floor((th - h) / 2), w, h)
      }
      tx.strokeStyle = bc(brand, 'navy')
      tx.lineWidth = 4
      roundRectPath(tx, 2, 2, tw - 4, th - 4, 24)
      tx.stroke()
      cx.drawImage(tile, 34 + i * (tw + 25), 56)
    })
    return withShadow(c)
  })!
  const badge = memo(`badge|${brand.id}|${e.label}`, () => {
    const font = latinFont(brand, 40)
    const m = ctx2d(makeCanvas(4, 4))
    m.font = font
    const bw = Math.floor(m.measureText(e.label).width) + 110
    const b = rounded(bw, 78, 39, bc(brand, 'navy'))
    const x = ctx2d(b)
    x.fillStyle = bc(brand, 'gold')
    x.beginPath()
    x.ellipse(36, 39, 14, 14, 0, 0, TAU)
    x.fill()
    x.font = font
    x.fillStyle = bc(brand, 'white')
    x.textBaseline = 'middle'
    x.fillText(e.label, 66, 41)
    return withShadow(b, 12, 0.4, 0, 8)
  })!
  return { card, badge }
}

export function drawCard(ctx: Ctx2D, t: number, e: CardEvent, brand: Brand, images: BrandImages): void {
  const st = animInOut(t, e.start, e.end, 0.4, 0.25)
  if (!st) return
  const { card, badge } = cardSprites(e, brand, images)
  const [ph, p] = st
  const s = ph === 'in' ? 0.5 + 0.5 * easeOutBack(p) : ph === 'out' ? 1 - 0.3 * p : 1
  const a = ph === 'in' ? clamp01(p * 2.5) : ph === 'out' ? 1 - p : 1
  const fl = 8 * Math.sin((TAU * (t - e.start)) / 2.0)
  paste(ctx, card, e.x, e.y + fl, s, a)
  const st2 = animInOut(t - 0.15, e.start, e.end - 0.15, 0.35, 0.2)
  if (st2) {
    const [ph2, p2] = st2
    const s2 = ph2 === 'in' ? 0.3 + 0.7 * easeOutBack(p2) : ph2 === 'out' ? 1 - 0.4 * p2 : 1
    const a2 = ph2 === 'in' ? clamp01(p2 * 3) : ph2 === 'out' ? 1 - p2 : 1
    paste(ctx, badge, e.x, e.y - 200 * s + fl, s2, a2)
  }
}

// ---------------------------------------------------------------- pills

function pillSprite(brand: Brand, text: string): Sprite {
  return memo(`pill|${brand.id}|${text}`, () => {
    const font = latinFont(brand, 40, 'latin2')
    const m = ctx2d(makeCanvas(4, 4))
    m.font = font
    const w = Math.floor(m.measureText(text).width) + 100
    const p = rounded(w, 82, 18, 'rgba(20,30,40,0.92)')
    const x = ctx2d(p)
    x.fillStyle = bc(brand, 'mint')
    x.beginPath()
    x.ellipse(38, 41, 14, 14, 0, 0, TAU)
    x.fill()
    x.font = font
    x.fillStyle = bc(brand, 'white')
    x.textBaseline = 'middle'
    x.fillText(text, 68, 43)
    x.strokeStyle = 'rgba(255,255,255,0.235)'
    x.lineWidth = 2
    roundRectPath(x, 1, 1, w - 2, 80, 17)
    x.stroke()
    return withShadow(p, 14, 0.5, 0, 10)
  })!
}

export function drawPill(ctx: Ctx2D, t: number, e: PillEvent, brand: Brand): void {
  const st = animInOut(t, e.start, e.end, 0.3, 0.22)
  if (!st) return
  const [ph, p] = st
  const s = ph === 'in' ? 0.4 + 0.6 * easeOutBack(p) : ph === 'out' ? 1 - 0.3 * p : 1
  const a = ph === 'in' ? clamp01(p * 3) : ph === 'out' ? 1 - p : 1
  paste(ctx, pillSprite(brand, e.text), e.x, e.y + 5 * Math.sin((TAU * (t - e.start)) / 1.9), s, a)
}

// ---------------------------------------------------------------- sparkles

function sparkleSprite(size: number, col: string): Sprite {
  return memo(`spark|${size}|${col}`, () => {
    const S = size * 4
    const big = makeCanvas(S, S)
    const d = ctx2d(big)
    const c = S / 2, r = S / 2 - 2, k = S * 0.09
    d.fillStyle = col
    d.beginPath()
    const pts = [[c, c - r], [c + k, c - k], [c + r, c], [c + k, c + k], [c, c + r], [c - k, c + k], [c - r, c], [c - k, c - k]]
    pts.forEach(([px, py], i) => (i ? d.lineTo(px, py) : d.moveTo(px, py)))
    d.closePath()
    d.fill()
    const g = makeCanvas(size * 2, size * 2)
    const gx = ctx2d(g)
    gx.imageSmoothingQuality = 'high'
    gx.drawImage(big, size / 2, size / 2, size, size)
    const out = makeCanvas(size * 2, size * 2)
    const o = ctx2d(out)
    drawBlurred(o, g, col, size / 6, 1, 0, 0)
    o.drawImage(g, 0, 0)
    return { canvas: out, cx: size, cy: size }
  })!
}

interface Spark { t: number; x: number; y: number; gold: boolean }
const sparkCache = new Map<string, Spark[]>()
/** Seeded positions so preview and export always match. */
export function sparkPoints(e: SparklesEvent, captionY: number): Spark[] {
  const key = `${e.seed}|${e.count}|${e.start}|${e.end}|${captionY}`
  let pts = sparkCache.get(key)
  if (!pts) {
    const rnd = mulberry32(e.seed)
    pts = Array.from({ length: e.count }, (_, i) => {
      const x = 120 + rnd() * 840
      const sign = rnd() < 0.5 ? -1 : 1
      const y = captionY + sign * (95 + rnd() * 75)
      return { t: e.start + ((e.end - e.start) * i) / e.count, x, y, gold: i % 2 === 0 }
    })
    sparkCache.set(key, pts)
  }
  return pts
}

export function drawSparkles(ctx: Ctx2D, t: number, e: SparklesEvent, brand: Brand, captionY: number): void {
  if (t < e.start || t > e.end + 0.7) return
  for (const sp of sparkPoints(e, captionY)) {
    const dt = t - sp.t
    if (dt < 0 || dt > 0.7) continue
    const p = dt / 0.7
    const s = Math.sin(Math.PI * p)
    const spr = sp.gold ? sparkleSprite(70, bc(brand, 'gold')) : sparkleSprite(50, bc(brand, 'white'))
    paste(ctx, spr, sp.x, sp.y, 0.3 + 0.9 * s, s, p * 90)
  }
}

// ---------------------------------------------------------------- logo card

function logoSprite(images: BrandImages, width: number): Sprite | null {
  if (!images.logo) return null
  return memo(`logocard|${images.version}|${width}`, () => {
    const lg = resizeToWidth(images.logo!, Math.round(width))
    const c = rounded(width + 110, lg.height + 90, 50, 'rgba(255,255,255,0.98)')
    ctx2d(c).drawImage(lg, 55, 45)
    return withShadow(c)
  })
}

export function drawLogoCard(ctx: Ctx2D, t: number, e: LogoCardEvent, images: BrandImages): void {
  const st = animInOut(t, e.start, e.end, 0.45, 0.2)
  if (!st) return
  const [ph, p] = st
  const s = ph === 'in' ? 0.3 + 0.7 * easeOutBack(p) : ph === 'out' ? 1 - 0.3 * p : 1
  const a = ph === 'in' ? clamp01(p * 3) : ph === 'out' ? 1 - p : 1
  const rot = ph === 'in' ? (1 - p) * -12 : 0
  paste(ctx, logoSprite(images, e.width), e.x, e.y + 10 * Math.sin((TAU * (t - e.start)) / 2.0), s, a, rot)
}

// ---------------------------------------------------------------- watermark

function watermarkSprite(brand: Brand): Sprite {
  return memo(`wm|${brand.id}|${brand.handle}`, () => {
    const font = latinFont(brand, 30, 'latin2')
    const m = ctx2d(makeCanvas(4, 4))
    m.font = font
    const w = Math.floor(m.measureText(brand.handle).width) + 30
    const im = makeCanvas(Math.max(w, 120) + 40, 150)
    const d = ctx2d(im)
    const cx = Math.floor(im.width / 2)
    const white = bc(brand, 'white')
    d.strokeStyle = white
    d.lineWidth = 6
    roundRectPath(d, cx - 25, 17, 50, 50, 13)
    d.stroke()
    d.beginPath()
    d.ellipse(cx, 42, 10, 10, 0, 0, TAU)
    d.stroke()
    d.fillStyle = white
    d.beginPath()
    d.ellipse(cx + 16.5, 24.5, 3.5, 3.5, 0, 0, TAU)
    d.fill()
    d.font = font
    d.textAlign = 'center'
    d.textBaseline = 'middle'
    d.fillText(brand.handle, cx, 107)
    const out = makeCanvas(im.width, im.height)
    const o = ctx2d(out)
    drawBlurred(o, im, '#000', 6, 0.7, 0, 3)
    o.drawImage(im, 0, 0)
    return { canvas: out, cx: 0, cy: 0 }
  })!
}

export function drawWatermark(ctx: Ctx2D, w: WatermarkSettings, brand: Brand): void {
  if (!w.enabled || !brand.handle) return
  const spr = watermarkSprite(brand)
  paste(ctx, spr, OUT_W - spr.canvas.width - 30, w.y, 1, w.opacity)
}

// ---------------------------------------------------------------- end card

function endCardLayers(brand: Brand, images: BrandImages) {
  const bg = memo(`ecbg|${images.version}`, () => {
    const c = makeCanvas(OUT_W, OUT_H)
    const x = ctx2d(c)
    if (images.pattern) {
      const p = images.pattern
      const w = (p.width * OUT_H) / p.height
      x.imageSmoothingQuality = 'high'
      x.drawImage(p.image, (OUT_W - w) / 2, 0, w, OUT_H)
    } else {
      x.fillStyle = bc(brand, 'mint')
      x.fillRect(0, 0, OUT_W, OUT_H)
    }
    return { canvas: c, cx: 0, cy: 0 }
  })!
  const logo = images.logo
    ? memo(`eclogo|${images.version}`, () => {
        const c = resizeToWidth(images.logo!, 440)
        return { canvas: c, cx: c.width / 2, cy: c.height / 2 }
      })
    : null
  const tag = memo(`ectag|${brand.id}|${brand.endCard.taglineTop}|${brand.endCard.taglineBottom}`, () => {
    const c = makeCanvas(1000, 160)
    const d = ctx2d(c)
    d.font = latinFont(brand, 52)
    d.textAlign = 'center'
    d.textBaseline = 'middle'
    d.fillStyle = bc(brand, 'navy')
    d.fillText(brand.endCard.taglineTop, 500, 42)
    d.lineJoin = 'round'
    d.lineWidth = 6
    d.strokeStyle = bc(brand, 'navy')
    d.strokeText(brand.endCard.taglineBottom, 500, 117)
    d.fillStyle = bc(brand, 'gold')
    d.fillText(brand.endCard.taglineBottom, 500, 117)
    return { canvas: c, cx: 500, cy: 80 }
  })!
  const pill = (txt: string) =>
    memo(`ecpill|${brand.id}|${txt}`, () => {
      const font = latinFont(brand, 40, 'latin2')
      const m = ctx2d(makeCanvas(4, 4))
      m.font = font
      const w = Math.floor(m.measureText(txt).width) + 90
      const p = rounded(w, 84, 42, bc(brand, 'navy'))
      const d = ctx2d(p)
      d.fillStyle = bc(brand, 'mint')
      d.beginPath()
      d.ellipse(38, 42, 14, 14, 0, 0, TAU)
      d.fill()
      d.font = font
      d.fillStyle = bc(brand, 'white')
      d.textBaseline = 'middle'
      d.fillText(txt, 66, 44)
      return withShadow(p, 12, 0.35, 0, 8)
    })!
  return { bg, logo, tag, handle: brand.handle ? pill(brand.handle) : null, phone: brand.phone ? pill(brand.phone) : null }
}

/** Item delays (s) for logo, tagline, handle pill, phone pill. */
export const END_CARD_ITEM_DELAYS = [0.25, 0.5, 0.7, 0.85]
export const END_CARD_REVEAL = 0.45

export function drawEndCard(ctx: Ctx2D, t: number, ec: EndCardSettings, brand: Brand, images: BrandImages): void {
  if (!ec.enabled) return
  const dt = t - ec.start
  if (dt < 0) return
  const L = endCardLayers(brand, images)
  const p = clamp01(dt / END_CARD_REVEAL)
  const r = easeInOutSine(p) * 1150
  if (r > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(540, 900, r, 0, TAU)
    ctx.clip()
    ctx.drawImage(L.bg.canvas, 0, 0)
    ctx.restore()
  }
  for (const pr of ec.products) {
    const q = clamp01((dt - pr.delay) / 0.4)
    if (q <= 0) continue
    paste(ctx, productSprite(images, pr.product, pr.width), pr.x + pr.side * (1 - easeOutCubic(q)) * 200,
      pr.y + 12 * Math.sin((TAU * dt) / 1.8), 0.4 + 0.6 * easeOutBack(q), clamp01(q * 3), pr.rotation)
  }
  const item = (s: Sprite | null, x: number, y: number, delay: number, dur = 0.4) => {
    const q = clamp01((dt - delay) / dur)
    if (q > 0) paste(ctx, s, x, y, 0.4 + 0.6 * easeOutBack(q), clamp01(q * 3))
  }
  const [d1, d2, d3, d4] = END_CARD_ITEM_DELAYS
  item(L.logo, 540, 760 + 6 * Math.sin((TAU * dt) / 2.2), d1, 0.5)
  item(L.tag, 540, 1130, d2)
  item(L.handle, 540, 1300, d3)
  item(L.phone, 540, 1410, d4)
}

// ---------------------------------------------------------------- zoom

/** Camera zoom factor and vertical centre at time t (render.py zoom_at). */
export function zoomAt(t: number, events: ReelEvent[]): { z: number; cy: number } {
  let z = 1
  let cy = 820
  for (const e of events) {
    if (e.type === 'zoomPunch' && t >= e.start && t <= e.end) {
      const p = (t - e.start) / Math.max(0.01, e.end - e.start)
      const v = 1 + (e.amount - 1) * Math.pow(Math.max(0, Math.sin(Math.PI * p)), 0.7)
      if (v > z) { z = v; cy = e.centerY }
    } else if (e.type === 'zoomHold' && t >= e.start && t <= e.end) {
      const p = Math.min(1, (t - e.start) / e.ramp, (e.end - t) / e.ramp)
      const v = 1 + (e.amount - 1) * easeInOutSine(clamp01(p))
      if (v > z) { z = v; cy = e.centerY }
    }
  }
  return { z, cy }
}

/** Source crop box for a zoom (render.py apply_zoom). */
export function zoomBox(z: number, cy: number): { x: number; y: number; w: number; h: number } {
  const w = OUT_W / z
  const h = OUT_H / z
  return { x: (OUT_W - w) / 2, y: Math.min(OUT_H - h, Math.max(0, cy - h / 2)), w, h }
}
