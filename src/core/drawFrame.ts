// The single drawing function shared by the live preview and the exporter.
// It must stay pure and deterministic: same (t, project, brand, assets) ->
// same pixels. Later phases add caption and event layers here.

import { OUT_H, OUT_W, type Brand, type Project } from './types'

export interface FrameAssets {
  /** Current source frame, already seeked to time t. */
  source: CanvasImageSource | null
  sourceW: number
  sourceH: number
}

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Rectangle that scales (sw, sh) to cover (dw, dh), centred. */
export function coverRect(sw: number, sh: number, dw = OUT_W, dh = OUT_H) {
  const s = Math.max(dw / sw, dh / sh)
  const w = sw * s
  const h = sh * s
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
}

export function drawFrame(ctx: Ctx2D, _t: number, _project: Project, _brand: Brand | null, assets: FrameAssets): void {
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, OUT_W, OUT_H)
  if (assets.source && assets.sourceW > 0 && assets.sourceH > 0) {
    const r = coverRect(assets.sourceW, assets.sourceH)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(assets.source, r.x, r.y, r.w, r.h)
  }
  ctx.restore()
}
