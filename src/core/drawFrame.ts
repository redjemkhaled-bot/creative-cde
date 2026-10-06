// The single drawing function shared by the live preview and the exporter.
// Pure and deterministic: same (t, project, brand, assets) -> same pixels.
// Layer order follows compose() in reference/render.py.

import { drawCaptions } from './captions'
import {
  drawCard, drawEndCard, drawLogoCard, drawPill, drawProduct, drawSparkles, drawWatermark, zoomAt, zoomBox,
  type BrandImages
} from './effects'
import type { Ctx2D } from './sprites'
import { OUT_H, OUT_W, type Brand, type Project } from './types'

export type { Ctx2D }

export interface FrameAssets {
  /** Current source frame, already seeked to time t. */
  source: CanvasImageSource | null
  sourceW: number
  sourceH: number
  images: BrandImages | null
  /** Transparent background, no video: for the ProRes overlay export. */
  overlayOnly?: boolean
}

/** Rectangle that scales (sw, sh) to cover (dw, dh), centred. */
export function coverRect(sw: number, sh: number, dw = OUT_W, dh = OUT_H) {
  const s = Math.max(dw / sw, dh / sh)
  const w = sw * s
  const h = sh * s
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
}

/** Overlays keep drawing this long into the end card (under its reveal). */
const OVERLAY_TAIL = 0.5

export function drawFrame(ctx: Ctx2D, t: number, project: Project, brand: Brand | null, assets: FrameAssets): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (assets.overlayOnly) ctx.clearRect(0, 0, OUT_W, OUT_H)
  else {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, OUT_W, OUT_H)
    if (assets.source && assets.sourceW > 0 && assets.sourceH > 0) {
      const r = coverRect(assets.sourceW, assets.sourceH)
      const { z, cy } = zoomAt(t, project.events)
      if (z > 1.001) {
        const b = zoomBox(z, cy)
        ctx.scale(z, z)
        ctx.translate(-b.x, -b.y)
      }
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(assets.source, r.x, r.y, r.w, r.h)
    }
  }
  ctx.restore()
  if (!brand) return

  const images = assets.images ?? { products: new Map(), pattern: null, logo: null, version: -1 }
  const ec = project.endCard
  const ecOn = ec.enabled
  const captionY = project.captions.centerY ?? brand.caption.centerY
  if (!ecOn || t < ec.start + OVERLAY_TAIL) {
    if (!ecOn || t < ec.start) drawWatermark(ctx, project.watermark, brand)
    for (const e of project.events) if (e.type === 'product') drawProduct(ctx, t, e, images)
    for (const e of project.events) if (e.type === 'card') drawCard(ctx, t, e, brand, images)
    for (const e of project.events) if (e.type === 'pill') drawPill(ctx, t, e, brand)
    for (const e of project.events) if (e.type === 'logoCard') drawLogoCard(ctx, t, e, images)
    drawCaptions(ctx, t, project, brand)
    for (const e of project.events) if (e.type === 'sparkles') drawSparkles(ctx, t, e, brand, captionY)
  }
  drawEndCard(ctx, t, ec, brand, images)
}
