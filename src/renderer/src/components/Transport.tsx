import { useRef } from 'react'
import { formatTime } from '@core/time'
import { reelEnd } from '@core/types'
import { useStore } from '../store'

type Drag = 'playhead' | 'in' | 'out'
const SPEEDS = [0.5, 0.75, 1]

export function Transport({ onTap }: { onTap: () => void }) {
  const { project, time, playing, deadTail, speed, tapping } = useStore()
  const s = useStore.getState
  const barRef = useRef<HTMLDivElement>(null)
  const span = Math.max(project.video?.duration ?? 0, reelEnd(project))
  const pct = (t: number) => `${span ? (t / span) * 100 : 0}%`

  const timeAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * span
  }

  const startDrag = (kind: Drag) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    s().setPlaying(false)
    const apply = (x: number) => {
      const t = timeAt(x)
      if (kind === 'in') s().setInPoint(t)
      else if (kind === 'out') s().setOutPoint(t)
      s().setTime(kind === 'in' ? s().project.inPoint : kind === 'out' ? s().project.outPoint : t)
    }
    apply(e.clientX)
    const move = (ev: PointerEvent) => apply(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!project.video) return null
  return (
    <div className="transport">
      <div className="transport-row">
        <button className="btn icon" title="Previous frame (←)" onClick={() => s().setTime(time - 1 / 30)}>⏮</button>
        <button className="btn primary icon" title="Play / pause (Space)" onClick={() => s().setPlaying(!playing)}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="btn icon" title="Next frame (→)" onClick={() => s().setTime(time + 1 / 30)}>⏭</button>
        <span className="timecode">{formatTime(time)} <span className="dim">/ {formatTime(reelEnd(project) - project.inPoint)} reel</span></span>
        <select className="select" value={speed} title="Playback speed" onChange={(e) => s().set({ speed: Number(e.target.value) })}>
          {SPEEDS.map((v) => <option key={v} value={v}>{v}×</option>)}
        </select>
        <button className={`btn ${tapping ? 'tap-on' : ''}`} onClick={onTap} title="Play and press Space at the start of each word">
          {tapping ? '● Tapping… (Esc to stop)' : '⏺ Tap to time'}
        </button>
        <span className="spacer" />
        <button className="btn" title="Set in-point here (I)" onClick={() => s().setInPoint(time)}>Set in</button>
        <button className="btn" title="Set out-point here (O)" onClick={() => s().setOutPoint(time)}>Set out</button>
      </div>
      <div className="bar" ref={barRef} onPointerDown={startDrag('playhead')}>
        {deadTail?.outPoint != null && (
          <div className="bar-dead" style={{ left: pct(deadTail.outPoint), width: pct(project.video.duration - deadTail.outPoint) }} title="Black + silent tail" />
        )}
        <div className="bar-range" style={{ left: pct(project.inPoint), width: pct(project.outPoint - project.inPoint) }} />
        {project.endCard.enabled && (
          <div className="bar-ec" style={{ left: pct(project.endCard.start), width: pct(project.endCard.hold) }} title="End card" />
        )}
        <div className="handle in" style={{ left: pct(project.inPoint) }} onPointerDown={startDrag('in')} title="Drag in-point" />
        <div className="handle out" style={{ left: pct(project.outPoint) }} onPointerDown={startDrag('out')} title="Drag out-point" />
        <div className="playhead" style={{ left: pct(time) }} />
      </div>
    </div>
  )
}
