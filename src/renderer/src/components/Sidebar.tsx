import { formatTime } from '@core/time'
import { OUT_FPS, OUT_H, OUT_W, type CaptionPreset } from '@core/types'
import { activeBrand, useStore } from '../store'

const PRESETS: { id: CaptionPreset; label: string }[] = [
  { id: 'pop', label: 'Pop (word by word)' },
  { id: 'fade', label: 'Fade (word by word)' },
  { id: 'karaoke', label: 'Karaoke highlight' }
]

function TimeInput({ value, onChange }: { value: number; onChange: (t: number) => void }) {
  return (
    <input
      className="num"
      type="number"
      step={1 / 30}
      min={0}
      value={value.toFixed(2)}
      onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)}
    />
  )
}

export function Sidebar() {
  const { project, deadTail } = useStore()
  const brand = useStore(activeBrand)?.brand
  const s = useStore.getState()
  const centerY = project.captions.centerY ?? brand?.caption.centerY ?? 1330
  const v = project.video
  if (!v) return null
  const len = project.outPoint - project.inPoint
  return (
    <aside className="sidebar">
      <section>
        <h3>Source</h3>
        <dl>
          <dt>File</dt><dd title={v.path}>{v.path.split(/[\\/]/).pop()}</dd>
          <dt>Duration</dt><dd>{formatTime(v.duration)}</dd>
          <dt>Resolution</dt><dd>{v.width}×{v.height}</dd>
          <dt>Frame rate</dt><dd>{v.fps.toFixed(2)} fps</dd>
          <dt>Codec</dt><dd>{v.codec.toUpperCase()}{v.hasAudio ? ' + audio' : ' (no audio)'}</dd>
        </dl>
        {project.previewPath !== v.path && <p className="note">Previewing a converted copy. Export uses the original.</p>}
      </section>

      <section>
        <h3>Trim</h3>
        <div className="field"><label>In (s)</label><TimeInput value={project.inPoint} onChange={s.setInPoint} /></div>
        <div className="field"><label>Out (s)</label><TimeInput value={project.outPoint} onChange={s.setOutPoint} /></div>
        <div className="field"><label>Length</label><span>{len.toFixed(2)} s</span></div>
        {deadTail?.outPoint != null ? (
          <div className="callout">
            Black, silent ending found from <b>{deadTail.outPoint.toFixed(2)} s</b>.
            <div className="callout-actions">
              <button className="btn small" onClick={() => s.setOutPoint(deadTail.outPoint!)}>Cut it</button>
              <button className="btn small ghost" onClick={() => s.setOutPoint(v.duration)}>Keep full video</button>
            </div>
          </div>
        ) : deadTail ? (
          <p className="note">No black or silent ending found.</p>
        ) : null}
      </section>

      <section>
        <h3>Captions</h3>
        <div className="field">
          <label>Style</label>
          <select className="select" value={project.captions.preset} onChange={(e) => s.setCaptions({ preset: e.target.value as CaptionPreset })}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Height</label>
          <span className="dim">{Math.round(centerY)} px</span>
        </div>
        <input
          className="slider"
          type="range"
          min={300}
          max={1750}
          step={5}
          value={centerY}
          onChange={(e) => s.setCaptions({ centerY: e.target.valueAsNumber })}
          onDoubleClick={() => s.setCaptions({ centerY: null })}
          title="Double-click to reset to the brand default"
        />
      </section>

      <section>
        <h3>Output</h3>
        <dl>
          <dt>Size</dt><dd>{OUT_W}×{OUT_H}</dd>
          <dt>Frame rate</dt><dd>{OUT_FPS} fps</dd>
          <dt>Fit</dt><dd>Fill (crop)</dd>
        </dl>
      </section>
    </aside>
  )
}
