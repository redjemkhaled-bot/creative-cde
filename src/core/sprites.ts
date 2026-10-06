// Pre-rendered layers (text with shadow, products with shadow, cards, pills).
// Mirrors the sprite builders in reference/render.py: each element is drawn
// once with its blur/shadow into an offscreen canvas, then only transformed
// per frame. This keeps frames cheap and identical between preview and export.

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface Sprite {
  canvas: AnyCanvas
  /** Point inside the sprite that is placed at the target (x, y). */
  cx: number
  cy: number
}

/** Canvas factory: OffscreenCanvas everywhere it exists. */
export function makeCanvas(w: number, h: number): AnyCanvas {
  w = Math.max(1, Math.ceil(w))
  h = Math.max(1, Math.ceil(h))
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export const ctx2d = (c: AnyCanvas): Ctx2D => c.getContext('2d') as Ctx2D

const cache = new Map<string, Sprite | null>()
/** Memoise a sprite by key. Builders must be pure functions of the key. */
export function memo(key: string, build: () => Sprite | null): Sprite | null {
  if (cache.has(key)) return cache.get(key)!
  const s = build()
  cache.set(key, s)
  return s
}
/** Forget all sprites (after fonts or brand images change). */
export const clearSprites = (): void => cache.clear()

/** Copy of `src` as a solid-colour silhouette (keeps the alpha channel). */
function silhouette(src: AnyCanvas, color: string): AnyCanvas {
  const c = makeCanvas(src.width, src.height)
  const x = ctx2d(c)
  x.drawImage(src, 0, 0)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = color
  x.fillRect(0, 0, c.width, c.height)
  return c
}

/**
 * PIL-style blurred shadow: blur(alpha) * opacity, offset, under the image.
 * `blur` is the Gaussian radius (PIL GaussianBlur(radius) ≈ CSS blur(radius)).
 */
export function drawBlurred(dst: Ctx2D, src: AnyCanvas, color: string, blur: number, opacity: number, dx: number, dy: number): void {
  dst.save()
  dst.filter = `blur(${blur}px)`
  dst.globalAlpha = opacity
  dst.drawImage(silhouette(src, color), dx, dy)
  dst.restore()
}

/** Pad an image and put a soft shadow under it (render.py with_shadow). */
export function withShadow(img: AnyCanvas, blur = 22, opacity = 0.45, ox = 0, oy = 16, pad = 60): Sprite {
  const c = makeCanvas(img.width + 2 * pad, img.height + 2 * pad)
  const x = ctx2d(c)
  const placed = makeCanvas(c.width, c.height)
  ctx2d(placed).drawImage(img, pad, pad)
  drawBlurred(x, placed, '#000', blur, opacity, ox, oy)
  x.drawImage(img, pad, pad)
  return { canvas: c, cx: c.width / 2, cy: c.height / 2 }
}

export function roundRectPath(x: Ctx2D, l: number, t: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2)
  x.beginPath()
  x.moveTo(l + r, t)
  x.arcTo(l + w, t, l + w, t + h, r)
  x.arcTo(l + w, t + h, l, t + h, r)
  x.arcTo(l, t + h, l, t, r)
  x.arcTo(l, t, l + w, t, r)
  x.closePath()
}

export function rounded(w: number, h: number, r: number, fill: string): AnyCanvas {
  const c = makeCanvas(w, h)
  const x = ctx2d(c)
  x.fillStyle = fill
  roundRectPath(x, 0, 0, w, h, r)
  x.fill()
  return c
}

/** Bounding box of non-transparent pixels. */
export function alphaBBox(img: CanvasImageSource, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const c = makeCanvas(w, h)
  const x = ctx2d(c)
  x.drawImage(img, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let yy = 0; yy < h; yy++) {
    const row = yy * w * 4
    for (let xx = 0; xx < w; xx++) {
      if (d[row + xx * 4 + 3] > 0) {
        if (xx < x0) x0 = xx
        if (xx > x1) x1 = xx
        if (yy < y0) y0 = yy
        if (yy > y1) y1 = yy
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

export interface ImageLike {
  image: CanvasImageSource
  width: number
  height: number
}

/** Image trimmed to its visible pixels (cached per image object). */
const trimmed = new WeakMap<object, AnyCanvas>()
export function trim(img: ImageLike): AnyCanvas {
  const hit = trimmed.get(img)
  if (hit) return hit
  const bb = alphaBBox(img.image, img.width, img.height)
  const c = makeCanvas(bb.w, bb.h)
  ctx2d(c).drawImage(img.image, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h)
  trimmed.set(img, c)
  return c
}

/** Resize keeping aspect ratio to a given width. */
export function resizeToWidth(src: AnyCanvas | ImageLike, width: number): AnyCanvas {
  const sw = 'image' in src ? src.width : src.width
  const sh = 'image' in src ? src.height : src.height
  const img = 'image' in src ? src.image : src
  const h = Math.max(1, Math.round((sh * width) / sw))
  const c = makeCanvas(width, h)
  const x = ctx2d(c)
  x.imageSmoothingQuality = 'high'
  x.drawImage(img, 0, 0, width, h)
  return c
}

/**
 * Draw a sprite centred at (x, y) with scale, alpha and rotation (degrees,
 * counter-clockwise like PIL's rotate) — render.py paste_scaled().
 */
export function paste(ctx: Ctx2D, s: Sprite | null, x: number, y: number, scale = 1, alpha = 1, rot = 0): void {
  if (!s || scale <= 0.02 || alpha <= 0.01) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.translate(x, y)
  if (rot) ctx.rotate((-rot * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.drawImage(s.canvas, -s.cx, -s.cy)
  ctx.restore()
}
