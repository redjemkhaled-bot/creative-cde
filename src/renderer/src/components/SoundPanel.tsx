import { useStore } from '../store'

function Volume({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <>
      <div className="field"><label>{label}</label><span className="dim">{Math.round(value * 100)}%</span></div>
      <input className="slider" type="range" min={0} max={2} step={0.05} value={value} onChange={(e) => onChange(e.target.valueAsNumber)} />
    </>
  )
}

function CustomFile({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <span className="filepick">
        <span className="dim small" title={value ?? ''}>{value ? value.split(/[\\/]/).pop() : 'Generated'}</span>
        <button className="btn small ghost" onClick={async () => {
          const [f] = await window.api.pickFiles(`Choose a sound for ${label.toLowerCase()}`, ['wav', 'mp3', 'm4a', 'aac', 'ogg'])
          if (f) onChange(f)
        }}>Choose…</button>
        {value && <button className="btn small ghost" onClick={() => onChange(null)}>✕</button>}
      </span>
    </div>
  )
}

export function SoundPanel() {
  const sfx = useStore((s) => s.project.sfx)
  const preview = useStore((s) => s.sfxPreview)
  const s = useStore.getState()
  return (
    <section>
      <div className="section-head">
        <h3>Sound effects</h3>
        <label className="check"><input type="checkbox" checked={sfx.enabled} onChange={(e) => s.setSfx({ enabled: e.target.checked })} /> On</label>
      </div>
      <p className="note">A pop on every product, pill, card and logo; a whoosh on zooms and the end card. Mixed on top of the original audio.</p>
      {sfx.enabled && (
        <>
          <Volume label="Pop volume" value={sfx.popVolume} onChange={(v) => s.setSfx({ popVolume: v })} />
          <Volume label="Whoosh volume" value={sfx.whooshVolume} onChange={(v) => s.setSfx({ whooshVolume: v })} />
          <CustomFile label="Pop sound" value={sfx.popFile} onChange={(v) => s.setSfx({ popFile: v })} />
          <CustomFile label="Whoosh sound" value={sfx.whooshFile} onChange={(v) => s.setSfx({ whooshFile: v })} />
          <label className="check"><input type="checkbox" checked={preview} onChange={(e) => s.set({ sfxPreview: e.target.checked })} /> Hear them in the preview</label>
        </>
      )}
    </section>
  )
}
