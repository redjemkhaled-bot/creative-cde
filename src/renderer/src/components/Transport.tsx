import { useRef } from 'react'
import { formatTime } from '@core/time'
import { useStore } from '../store'

type Drag = 'playhead' | 'in' | 'out'

export function Transport() {
  const { project, time, playing, deadTail } = useStore()
  const s = useStore.getState
  const barRef = useRef<HTMLDivElement>(null)
  const dur = project.video?.duration ?? 0
  const pct = (t: number) => `${dur ? (t / dur) * 100 : 0}%`

  const timeAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * dur
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
        <span className="timecode">{formatTime(time)} <span className="dim">/ {formatTime(dur)}</span></span>
        <span className="spacer" />
        <button className="btn" title="Set in-point here (I)" onClick={() => s().setInPoint(time)}>Set in</button>
        <button className="btn" title="Set out-point here (O)" onClick={() => s().setOutPoint(time)}>Set out</button>
      </div>
      <div className="bar" ref={barRef} onPointerDown={startDrag('playhead')}>
        {deadTail?.outPoint != null && (
          <div className="bar-dead" style={{ left: pct(deadTail.outPoint), right: 0 }} title="Black + silent tail" />
        )}
        <div className="bar-range" style={{ left: pct(project.inPoint), width: pct(project.outPoint - project.inPoint) }} />
        <div className="handle in" style={{ left: pct(project.inPoint) }} onPointerDown={startDrag('in')} title="Drag in-point" />
        <div className="handle out" style={{ left: pct(project.outPoint) }} onPointerDown={startDrag('out')} title="Drag out-point" />
        <div className="playhead" style={{ left: pct(time) }} />
      </div>
    </div>
  )
}
