import { useEffect, useRef } from 'react'
import { drawFrame } from '@core/drawFrame'
import { OUT_H, OUT_W, reelEnd, type ReelEvent } from '@core/types'
import { activeBrand, useStore } from '../store'
import { mediaUrl } from '../media'
import { startSfx, stopSfx } from '../sfxPreview'

interface Props {
  /** Called when Chromium can't decode the file (e.g. HEVC without HW support). */
  onUnsupported: () => void
}

type Positioned = Extract<ReelEvent, { x: number; y: number }>
const positioned = (e: ReelEvent): e is Positioned => 'x' in e && 'y' in e

/**
 * Owns the <video> element. The visible canvas is always produced by
 * drawFrame(), the same function the exporter uses. Past the out-point the
 * last frame is held (end-card hold), exactly like the export.
 */
export function Preview({ onUnsupported }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewPath = useStore((s) => s.project.previewPath)
  const playing = useStore((s) => s.playing)
  const time = useStore((s) => s.time)
  const project = useStore((s) => s.project)
  const assetsVersion = useStore((s) => s.assetsVersion)
  const speed = useStore((s) => s.speed)
  const selected = useStore((s) => s.selectedEvent)

  const draw = () => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!c) return
    const s = useStore.getState()
    const ready = v && v.readyState >= 2
    drawFrame(c.getContext('2d')!, s.time, s.project, activeBrand(s)?.brand ?? null, {
      source: ready ? v : null,
      sourceW: v?.videoWidth ?? 0,
      sourceH: v?.videoHeight ?? 0,
      images: s.images
    })
  }

  /** Video position for a reel time: held at the last frame after the out-point. */
  const videoTimeFor = (t: number) => Math.min(t, useStore.getState().project.outPoint - 0.02)

  // Playback: follow the video's clock; after the out-point run a virtual clock.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (!playing) {
      v.pause()
      stopSfx()
      return
    }
    const st = useStore.getState()
    const end = reelEnd(st.project)
    let t0 = st.time
    if (t0 >= end - 1 / 30 || t0 < st.project.inPoint) t0 = st.project.inPoint
    st.setTime(t0)
    v.playbackRate = st.speed
    if (st.sfxPreview) void startSfx(st.project, t0, st.speed)
    let cancelled = false
    let raf = 0
    let vfc = 0
    const virtual = (from: number) => {
      const wall0 = performance.now()
      v.pause()
      const step = () => {
        if (cancelled) return
        const s = useStore.getState()
        const t = from + ((performance.now() - wall0) / 1000) * s.speed
        if (t >= reelEnd(s.project)) {
          s.setTime(reelEnd(s.project))
          s.setPlaying(false)
          return
        }
        s.setTime(t)
        draw()
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    if (t0 >= st.project.outPoint) virtual(t0)
    else {
      v.currentTime = t0
      void v.play().catch(() => useStore.getState().setPlaying(false))
      const tick = () => {
        if (cancelled) return
        const s = useStore.getState()
        if (v.currentTime >= s.project.outPoint - 0.01 || v.ended) {
          if (reelEnd(s.project) > s.project.outPoint) virtual(Math.max(v.currentTime, s.project.outPoint))
          else {
            v.pause()
            s.setTime(s.project.outPoint)
            s.setPlaying(false)
          }
          return
        }
        s.setTime(v.currentTime)
        draw()
        vfc = v.requestVideoFrameCallback(tick)
      }
      vfc = v.requestVideoFrameCallback(tick)
    }
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      v.cancelVideoFrameCallback(vfc)
      stopSfx()
    }
  }, [playing])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  // Scrubbing while paused: seek, then draw once the frame is decoded.
  useEffect(() => {
    const v = videoRef.current
    if (!v || playing) return
    const vt = videoTimeFor(time)
    if (Math.abs(v.currentTime - vt) > 1 / 120) v.currentTime = vt
    else draw()
  }, [time, playing])

  // Project, style or asset changes: redraw the current frame.
  useEffect(() => {
    if (!playing) draw()
  }, [project, assetsVersion])

  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [])

  // Click to select a positioned overlay, drag to move it.
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const k = OUT_W / r.width
    const toCanvas = (ev: { clientX: number; clientY: number }) => ({ x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k })
    const p0 = toCanvas(e)
    const s = useStore.getState()
    const t = s.time
    const visible = s.project.events.filter((ev): ev is Positioned => positioned(ev) && t >= ev.start - 0.1 && t <= ev.end + 0.3)
    let hit: Positioned | null = null
    let best = 200
    for (const ev of visible) {
      const d = Math.hypot(ev.x - p0.x, ev.y - p0.y)
      if (d < best || ev.id === s.selectedEvent) {
        if (ev.id === s.selectedEvent && d < 260) { hit = ev; break }
        if (d < best) { best = d; hit = ev }
      }
    }
    if (!hit) {
      s.set({ selectedEvent: null })
      return
    }
    s.set({ selectedEvent: hit.id, sideTab: 'events' })
    const start = { x: hit.x, y: hit.y }
    const id = hit.id
    c.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const p = toCanvas(ev)
      useStore.getState().updateEvent(id, { x: Math.round(start.x + p.x - p0.x), y: Math.round(start.y + p.y - p0.y) } as Partial<ReelEvent>, `drag-${id}`)
    }
    const up = () => {
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
    }
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
  }

  const sel = project.events.find((e) => e.id === selected)
  return (
    <div className="preview">
      <div className="preview-frame">
        <canvas ref={canvasRef} width={OUT_W} height={OUT_H} className="preview-canvas" onPointerDown={onPointerDown} />
        {sel && positioned(sel) && time >= sel.start - 0.1 && time <= sel.end + 0.3 && (
          <div className="sel-marker" style={{ left: `${(sel.x / OUT_W) * 100}%`, top: `${(sel.y / OUT_H) * 100}%` }} />
        )}
      </div>
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
          const vt = videoTimeFor(useStore.getState().time)
          if (Math.abs(v.currentTime - vt) > 1 / 120) v.currentTime = vt
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
