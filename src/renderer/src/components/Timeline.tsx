import { useEffect, useMemo, useRef, useState } from 'react'
import { snap, snapPoints } from '@core/audioAnalysis'
import { formatTime } from '@core/time'
import { reelEnd, type ReelEvent } from '@core/types'
import { currentTiming, useStore } from '../store'

const RULER = 20
const WAVE = 64
const TOKENS = 34
const LANE = 26
const MAX_CANVAS = 30000
const SNAP_PX = 7

const EVENT_COLORS: Record<ReelEvent['type'], string> = {
  product: '#5aa9e6',
  zoomPunch: '#c77dff',
  zoomHold: '#9d4edd',
  card: '#f4a261',
  pill: '#2a9d8f',
  sparkles: '#f2c83f',
  logoCard: '#e76f51'
}

export function eventLabel(e: ReelEvent): string {
  switch (e.type) {
    case 'product': return e.product.replace(/\.[^.]+$/, '').replace(/^products-/, 'Product ')
    case 'zoomPunch': return `Zoom ×${e.amount}`
    case 'zoomHold': return `Zoom hold ×${e.amount}`
    case 'card': return `Card · ${e.label}`
    case 'pill': return e.text
    case 'sparkles': return '✦ Sparkles'
    case 'logoCard': return 'Logo card'
  }
}

/** Greedy lane assignment so overlapping events stack. */
function lanes(events: ReelEvent[]): Map<string, number> {
  const ends: number[] = []
  const out = new Map<string, number>()
  for (const e of [...events].sort((a, b) => a.start - b.start)) {
    let l = ends.findIndex((end) => end <= e.start)
    if (l < 0) { l = ends.length; ends.push(0) }
    ends[l] = e.end
    out.set(e.id, l)
  }
  return out
}

export function Timeline() {
  const project = useStore((s) => s.project)
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const analysis = useStore((s) => s.analysis)
  const selected = useStore((s) => s.selectedEvent)
  useStore((s) => s.brands)
  const scrollRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const [pps, setPps] = useState(40)
  const total = Math.max(project.video?.duration ?? 0, reelEnd(project)) + 0.5
  const width = Math.min(MAX_CANVAS, total * pps)
  const k = width / total // px per second actually used
  const { chunks, timing } = currentTiming()
  const points = useMemo(() => (analysis ? snapPoints(analysis) : []), [analysis])
  const laneOf = useMemo(() => lanes(project.events), [project.events])
  const laneCount = Math.max(1, ...[...laneOf.values()].map((l) => l + 1))

  // Fit the trimmed range on first load / video change.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !project.video) return
    const len = Math.max(5, reelEnd(project) - project.inPoint + 1)
    setPps(Math.max(8, (el.clientWidth - 20) / len))
  }, [project.video?.path])

  // Waveform with pauses shaded.
  useEffect(() => {
    const c = waveRef.current
    if (!c) return
    c.width = Math.ceil(width)
    c.height = WAVE
    const x = c.getContext('2d')!
    x.clearRect(0, 0, c.width, c.height)
    if (!analysis) return
    x.fillStyle = 'rgba(255,255,255,0.05)'
    for (const p of analysis.pauses) x.fillRect(p.start * k, 0, (p.end - p.start) * k, WAVE)
    x.fillStyle = '#6b8fb3'
    const per = analysis.peaks.length / analysis.duration // frames per second
    const mid = WAVE / 2
    // Normalise to the loudest point so quiet recordings stay readable.
    let loud = 1e-4
    for (let i = 0; i < analysis.peaks.length; i++) if (analysis.peaks[i] > loud) loud = analysis.peaks[i]
    for (let px = 0; px < c.width; px++) {
      const a = Math.floor((px / k) * per)
      const b = Math.max(a + 1, Math.floor(((px + 1) / k) * per))
      let pk = 0
      for (let i = a; i < b && i < analysis.peaks.length; i++) pk = Math.max(pk, analysis.peaks[i])
      const h = Math.min(1, pk / loud) * (mid - 2)
      if (h > 0.5) x.fillRect(px, mid - h, 1, h * 2)
    }
  }, [analysis, width, k])

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = time * k
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 80
  }, [time, playing, k])

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!
    const r = el.getBoundingClientRect()
    return (clientX - r.left + el.scrollLeft) / k
  }
  const snapT = (t: number, alt: boolean) => (alt ? t : snap(t, points, SNAP_PX / k))

  const drag = (e: React.PointerEvent, onMove: (dt: number, alt: boolean) => void) => {
    e.stopPropagation()
    e.preventDefault()
    useStore.getState().setPlaying(false)
    const x0 = e.clientX
    const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / k, ev.altKey)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const scrub = (e: React.PointerEvent) => {
    const s = useStore.getState()
    s.setPlaying(false)
    s.setTime(timeAt(e.clientX))
    e.preventDefault()
    const move = (ev: PointerEvent) => useStore.getState().setTime(timeAt(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const el = scrollRef.current!
    const t = timeAt(e.clientX)
    const next = Math.min(MAX_CANVAS / total, Math.max(4, pps * (e.deltaY < 0 ? 1.25 : 0.8)))
    setPps(next)
    requestAnimationFrame(() => (el.scrollLeft = t * Math.min(MAX_CANVAS / total, next) - (e.clientX - el.getBoundingClientRect().left)))
  }

  // Token blocks.
  const tokenBlocks = timing.flatMap((tc) =>
    tc.tokens.map((tok, j) => {
      const next = j + 1 < tc.tokens.length ? tc.tokens[j + 1].start : tc.end
      return { tc, tok, j, end: next, token: chunks[tc.index].tokens[j] }
    })
  )

  const ticks: number[] = []
  const step = k > 80 ? 0.5 : k > 30 ? 1 : k > 12 ? 2 : 5
  for (let t = 0; t <= total; t += step) ticks.push(t)

  if (!project.video) return null
  return (
    <div className="timeline">
      <div className="timeline-tools">
        <span className="dim">Timeline</span>
        <button className="btn small ghost" onClick={() => setPps((p) => Math.max(4, p * 0.7))} title="Zoom out (Ctrl+wheel)">−</button>
        <button className="btn small ghost" onClick={() => setPps((p) => Math.min(MAX_CANVAS / total, p * 1.4))} title="Zoom in (Ctrl+wheel)">+</button>
        <button className="btn small ghost" onClick={() => {
          const el = scrollRef.current!
          setPps(Math.max(4, (el.clientWidth - 20) / Math.max(5, reelEnd(project) - project.inPoint + 1)))
          el.scrollLeft = project.inPoint * k
        }}>Fit</button>
        <span className="dim small">Drag words to nudge · snaps to speech (hold Alt to stop snapping) · drag event edges to resize</span>
      </div>
      <div className="timeline-scroll" ref={scrollRef} onWheel={onWheel}>
        <div className="timeline-inner" style={{ width, height: RULER + WAVE + TOKENS + laneCount * LANE + 6 }}>
          <div className="tl-ruler" style={{ height: RULER }} onPointerDown={scrub}>
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: t * k }}>{Number.isInteger(t) && (t % (step * 2) === 0 || step >= 1) ? formatTime(t).slice(1, 5) : ''}</span>
            ))}
          </div>
          <canvas ref={waveRef} className="tl-wave" style={{ top: RULER, width, height: WAVE }} onPointerDown={scrub} />
          {!analysis && <div className="tl-wave-msg" style={{ top: RULER + 22 }}>Reading audio…</div>}
          <div className="tl-dim" style={{ left: 0, width: project.inPoint * k }} />
          <div className="tl-dim" style={{ left: project.outPoint * k, width: Math.max(0, (Math.max(project.video.duration, reelEnd(project)) - project.outPoint) * k) }} />
          {project.endCard.enabled && (
            <div className="tl-endcard" style={{ left: project.endCard.start * k, width: project.endCard.hold * k, top: RULER }}
              title="End card" onPointerDown={(e) => {
                const s0 = project.endCard.start
                drag(e, (dt, alt) => useStore.getState().setEndCard({ start: Math.max(0, +snapT(s0 + dt, alt).toFixed(2)) }, 'ec-drag'))
              }}>END CARD</div>
          )}
          <div className="tl-tokens" style={{ top: RULER + WAVE, height: TOKENS }}>
            {tokenBlocks.map(({ tc, tok, j, end, token }) => (
              <div
                key={tok.index}
                className={`tl-tok ${token.keyword ? 'kw' : ''} ${tok.tapped ? 'tapped' : ''} ${j === 0 ? 'first' : ''}`}
                style={{ left: tok.start * k, width: Math.max(3, (end - tok.start) * k - 1) }}
                title={`${token.text} · ${tok.start.toFixed(2)} s${tok.tapped ? ' (tapped)' : ' (auto)'}`}
                onPointerDown={(e) => {
                  const t0 = tok.start
                  const prev = tokenBlocks.find((b) => b.tok.index === tok.index - 1)?.tok.start ?? 0
                  const nextStart = tokenBlocks.find((b) => b.tok.index === tok.index + 1)?.tok.start ?? Infinity
                  useStore.getState().setTime(t0)
                  drag(e, (dt, alt) => {
                    const t = Math.min(nextStart - 0.03, Math.max(prev + 0.03, snapT(t0 + dt, alt)))
                    useStore.getState().setTokenTime(tok.index, +t.toFixed(3), `tok-${tok.index}`)
                  })
                }}
                onDoubleClick={() => useStore.getState().setTokenTime(tok.index, null)}
              >
                <span dir="auto">{token.text}</span>
                {j === tc.tokens.length - 1 && (
                  <i className="tl-edge" title="Drag to change when this screen ends" onPointerDown={(e) => {
                    const e0 = tc.end
                    drag(e, (dt, alt) => useStore.getState().setChunkTime(tc.index, 'end', +Math.max(tok.start + 0.1, snapT(e0 + dt, alt)).toFixed(3)))
                  }} />
                )}
              </div>
            ))}
          </div>
          {project.events.map((ev) => (
            <div
              key={ev.id}
              className={`tl-ev ${ev.id === selected ? 'sel' : ''}`}
              style={{ left: ev.start * k, width: Math.max(4, (ev.end - ev.start) * k), top: RULER + WAVE + TOKENS + 3 + (laneOf.get(ev.id) ?? 0) * LANE, background: EVENT_COLORS[ev.type] }}
              title={`${eventLabel(ev)} · ${ev.start.toFixed(2)}–${ev.end.toFixed(2)} s`}
              onPointerDown={(e) => {
                const s = useStore.getState()
                s.set({ selectedEvent: ev.id, sideTab: 'events' })
                const { start, end } = ev
                drag(e, (dt, alt) => {
                  const ns = Math.max(0, snapT(start + dt, alt))
                  useStore.getState().updateEvent(ev.id, { start: +ns.toFixed(3), end: +(ns + end - start).toFixed(3) }, `evmove-${ev.id}`)
                })
              }}
            >
              <i className="tl-ev-edge l" onPointerDown={(e) => {
                useStore.getState().set({ selectedEvent: ev.id })
                const { start, end } = ev
                drag(e, (dt, alt) => useStore.getState().updateEvent(ev.id, { start: +Math.min(end - 0.1, Math.max(0, snapT(start + dt, alt))).toFixed(3) }, `evl-${ev.id}`))
              }} />
              <span>{eventLabel(ev)}</span>
              <i className="tl-ev-edge r" onPointerDown={(e) => {
                useStore.getState().set({ selectedEvent: ev.id })
                const { start, end } = ev
                drag(e, (dt, alt) => useStore.getState().updateEvent(ev.id, { end: +Math.max(start + 0.1, snapT(end + dt, alt)).toFixed(3) }, `evr-${ev.id}`))
              }} />
            </div>
          ))}
          <div className="tl-playhead" style={{ left: time * k }} />
        </div>
      </div>
    </div>
  )
}
