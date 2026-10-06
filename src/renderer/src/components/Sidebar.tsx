import { formatTime } from '@core/time'
import { OUT_FPS, OUT_H, OUT_W, reelEnd, type CaptionPreset } from '@core/types'
import { activeBrand, useStore, type SideTab } from '../store'
import { EventsPanel } from './EventsPanel'
import { SoundPanel } from './SoundPanel'

const PRESETS: { id: CaptionPreset; label: string }[] = [
  { id: 'pop', label: 'Pop (word by word)' },
  { id: 'fade', label: 'Fade (word by word)' },
  { id: 'karaoke', label: 'Karaoke highlight' }
]

export function TimeInput({ value, onChange, step = 1 / 30, width }: { value: number; onChange: (t: number) => void; step?: number; width?: number }) {
  return (
    <input
      className="num"
      style={width ? { width } : undefined}
      type="number"
      step={step}
      value={Number.isFinite(value) ? +value.toFixed(3) : 0}
      onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)}
    />
  )
}

function VideoTab() {
  const { project, deadTail } = useStore()
  const s = useStore.getState()
  const v = project.video!
  return (
    <>
      <section>
        <h3>Source</h3>
        <dl>
          <dt>File</dt><dd title={v.path}>{v.path.split(/[\\/]/).pop()}</dd>
          <dt>Duration</dt><dd>{formatTime(v.duration)}</dd>
          <dt>Resolution</dt><dd>{v.width}×{v.height}</dd>
          <dt>Frame rate</dt><dd>{v.fps.toFixed(2)} fps</dd>
          <dt>Codec</dt><dd>{v.codec.toUpperCase()}{v.hasAudio ? ' + audio' : ' (no audio)'}</dd>
        </dl>
        {project.previewPath && project.previewPath !== v.path && <p className="note">Previewing a converted copy. Export uses the original.</p>}
      </section>
      <section>
        <h3>Trim</h3>
        <div className="field"><label>In (s)</label><TimeInput value={project.inPoint} onChange={s.setInPoint} /></div>
        <div className="field"><label>Out (s)</label><TimeInput value={project.outPoint} onChange={s.setOutPoint} /></div>
        <div className="field"><label>Video length</label><span>{(project.outPoint - project.inPoint).toFixed(2)} s</span></div>
        <div className="field"><label>Reel length</label><span>{(reelEnd(project) - project.inPoint).toFixed(2)} s</span></div>
        {deadTail?.outPoint != null ? (
          <div className="callout">
            Black, silent ending found from <b>{deadTail.outPoint.toFixed(2)} s</b>.
            <div className="callout-actions">
              <button className="btn small" onClick={() => s.setOutPoint(deadTail.outPoint!)}>Cut it</button>
              <button className="btn small ghost" onClick={() => s.setOutPoint(v.duration)}>Keep full video</button>
            </div>
          </div>
        ) : deadTail ? <p className="note">No black or silent ending found.</p> : null}
      </section>
      <section>
        <h3>Output</h3>
        <dl>
          <dt>Size</dt><dd>{OUT_W}×{OUT_H}</dd>
          <dt>Frame rate</dt><dd>{OUT_FPS} fps</dd>
          <dt>Fit</dt><dd>Fill (crop)</dd>
        </dl>
      </section>
    </>
  )
}

function CaptionsTab() {
  const project = useStore((s) => s.project)
  const brand = useStore(activeBrand)?.brand
  const s = useStore.getState()
  const centerY = project.captions.centerY ?? brand?.caption.centerY ?? 1330
  return (
    <section>
      <h3>Caption style</h3>
      <div className="field">
        <label>Style</label>
        <select className="select" value={project.captions.preset} onChange={(e) => s.setCaptions({ preset: e.target.value as CaptionPreset })}>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div className="field"><label>Height (centre)</label><span className="dim">{Math.round(centerY)} px</span></div>
      <input className="slider" type="range" min={300} max={1750} step={5} value={centerY}
        onChange={(e) => s.setCaptions({ centerY: e.target.valueAsNumber })}
        onDoubleClick={() => s.setCaptions({ centerY: null })} title="Double-click to reset to the brand default" />
      <p className="note">Fonts, colours, sizes and outline come from the brand ({brand?.name}).</p>
    </section>
  )
}

const TABS: { id: SideTab; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'captions', label: 'Captions' },
  { id: 'events', label: 'Events' },
  { id: 'sound', label: 'Sound' }
]

export function Sidebar() {
  const tab = useStore((s) => s.sideTab)
  const video = useStore((s) => s.project.video)
  if (!video) return null
  return (
    <aside className="sidebar">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => useStore.getState().set({ sideTab: t.id })}>{t.label}</button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'video' && <VideoTab />}
        {tab === 'captions' && <CaptionsTab />}
        {tab === 'events' && <EventsPanel />}
        {tab === 'sound' && <SoundPanel />}
      </div>
    </aside>
  )
}
