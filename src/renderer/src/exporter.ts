// Renderer side of the export: pull source frames, draw them with the same
// drawFrame() as the preview, push the result to the encoder.

import { drawFrame } from '@core/drawFrame'
import { OUT_FPS, OUT_H, OUT_W, type Brand, type Project } from '@core/types'
import type { BrandImages } from '@core/effects'

export type ExportKind = 'mp4' | 'overlay'

export interface Progress { done: number; total: number; eta: number | null; fps: number }

export async function runExport(
  project: Project,
  brand: Brand,
  images: BrandImages | null,
  kind: ExportKind,
  out: string,
  onProgress: (p: Progress) => void,
  isCancelled: () => boolean
): Promise<string> {
  const { frames, sourceFrames } = await window.api.exportStart(project, kind, out)
  const src = new OffscreenCanvas(OUT_W, OUT_H)
  const sctx = src.getContext('2d')!
  const dst = new OffscreenCanvas(OUT_W, OUT_H)
  const dctx = dst.getContext('2d', { willReadFrequently: true })!
  let haveSource = false
  let sourceDone = sourceFrames === 0
  const started = performance.now()
  // Fetch the next source frame while the current one is drawn and encoded.
  let pending: Promise<Uint8Array | null> | null = sourceDone ? null : window.api.exportNext()
  try {
    for (let i = 0; i < frames; i++) {
      if (isCancelled()) throw new Error('cancelled')
      const t = project.inPoint + i / OUT_FPS
      if (!sourceDone && pending) {
        const buf = await pending
        if (buf && i < sourceFrames) {
          sctx.putImageData(new ImageData(new Uint8ClampedArray(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength), OUT_W, OUT_H), 0, 0)
          haveSource = true
        }
        // After the out-point the last frame stays underneath (end-card hold).
        if (!buf || i + 1 >= sourceFrames) {
          sourceDone = true
          pending = null
        } else pending = window.api.exportNext()
      }
      drawFrame(dctx, t, project, brand, {
        source: haveSource ? src : null,
        sourceW: OUT_W,
        sourceH: OUT_H,
        images,
        overlayOnly: kind === 'overlay'
      })
      await window.api.exportWrite(dctx.getImageData(0, 0, OUT_W, OUT_H).data)
      if (i % 3 === 0 || i === frames - 1) {
        const el = (performance.now() - started) / 1000
        const fps = (i + 1) / el
        onProgress({ done: i + 1, total: frames, fps, eta: i > 10 ? (frames - i - 1) / fps : null })
      }
    }
    return await window.api.exportFinish()
  } catch (e) {
    await window.api.exportCancel()
    throw e
  }
}
