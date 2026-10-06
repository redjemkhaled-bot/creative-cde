import { useEffect, useRef } from 'react'
import { drawFrame } from '@core/drawFrame'
import { OUT_H, OUT_W } from '@core/types'
import { activeBrand, useStore } from '../store'
import { mediaUrl } from '../media'

interface Props {
  /** Called when Chromium can't decode the file (e.g. HEVC without HW support). */
  onUnsupported: () => void
}

/**
 * Owns the <video> element. The visible canvas is always produced by
 * drawFrame(), the same function the exporter uses.
 */
export function Preview({ onUnsupported }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewPath = useStore((s) => s.project.previewPath)
  const playing = useStore((s) => s.playing)
  const time = useStore((s) => s.time)
  const project = useStore((s) => s.project)
  const fontsVersion = useStore((s) => s.fontsVersion)

  const draw = () => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!c) return
    const s = useStore.getState()
    const ready = v && v.readyState >= 2
    drawFrame(c.getContext('2d')!, s.time, s.project, activeBrand(s)?.brand ?? null, {
      source: ready ? v : null,
      sourceW: v?.videoWidth ?? 0,
      sourceH: v?.videoHeight ?? 0
    })
  }

  // Playback: follow the video's own clock, stop at the out-point.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (!playing) {
      v.pause()
      return
    }
    const { project, time: t0 } = useStore.getState()
    if (t0 >= project.outPoint - 1 / 30 || t0 < project.inPoint) v.currentTime = project.inPoint
    void v.play().catch(() => useStore.getState().setPlaying(false))
    let handle = 0
    const tick = () => {
      const s = useStore.getState()
      if (v.currentTime >= s.project.outPoint) {
        v.pause()
        s.setTime(s.project.outPoint)
        s.setPlaying(false)
        return
      }
      s.setTime(v.currentTime)
      draw()
      handle = v.requestVideoFrameCallback(tick)
    }
    handle = v.requestVideoFrameCallback(tick)
    return () => v.cancelVideoFrameCallback(handle)
  }, [playing])

  // Scrubbing while paused: seek, then draw once the frame is decoded.
  useEffect(() => {
    const v = videoRef.current
    if (!v || playing) return
    if (Math.abs(v.currentTime - time) > 1 / 120) v.currentTime = time
    else draw()
  }, [time, playing])

  // Script, timing, style or font changes: redraw the current frame.
  useEffect(() => {
    if (!playing) draw()
  }, [project, fontsVersion])

  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="preview">
      <canvas ref={canvasRef} width={OUT_W} height={OUT_H} className="preview-canvas" />
      <video
        ref={videoRef}
        src={previewPath ? mediaUrl(previewPath) : undefined}
        preload="auto"
        crossOrigin="anonymous"
        playsInline
        style={{ display: 'none' }}
        onSeeked={draw}
        onLoadedData={() => {
          // A new source (e.g. the preview copy) starts at 0; return to the playhead.
          const v = videoRef.current!
          const t = useStore.getState().time
          if (Math.abs(v.currentTime - t) > 1 / 120) v.currentTime = t
          else draw()
        }}
        onLoadedMetadata={() => {
          // Some codecs "load" with audio only and never produce a picture.
          const v = videoRef.current!
          if (v.videoWidth === 0) return onUnsupported()
          const timer = setTimeout(onUnsupported, 3000)
          v.requestVideoFrameCallback(() => clearTimeout(timer))
          if (v.paused) v.currentTime = v.currentTime + 0 // force a decode while paused
        }}
        onError={() => videoRef.current?.error && onUnsupported()}
      />
    </div>
  )
}
