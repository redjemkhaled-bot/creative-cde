import { useMemo } from 'react'
import { chunksFor, timingFor } from '@core/captions'
import { activeBrand, useStore } from '../store'

function TimeCell({ value, auto, onChange }: { value: number | null; auto: number; onChange: (v: number | null) => void }) {
  return (
    <input
      className={`num tiny ${value == null ? 'auto' : ''}`}
      type="number"
      step={0.01}
      min={0}
      placeholder={auto.toFixed(2)}
      value={value == null ? '' : value}
      title={value == null ? 'Automatic. Type a time to fix it.' : 'Clear to make automatic'}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
    />
  )
}

export function ScriptPanel() {
  const project = useStore((s) => s.project)
  const brand = useStore(activeBrand)?.brand
  const s = useStore.getState()
  const chunks = useMemo(() => (brand ? chunksFor(project, brand) : []), [project.script, brand])
  const timing = useMemo(() => (brand ? timingFor(project, brand) : []), [project, brand])
  const time = useStore((st) => st.time)

  return (
    <aside className="scriptpanel">
      <section>
        <div className="section-head">
          <h3>Script</h3>
          <button className="btn small ghost" onClick={s.loadDemoScript} title="Fill in the approved Younes v1 script and timings">
            Load v1 demo
          </button>
        </div>
        <textarea
          className="script"
          dir="auto"
          spellCheck={false}
          placeholder={'Paste your script here.\n\n*word* = keyword (gold)\n| = new screen\nNew line = new screen'}
          value={project.script}
          onChange={(e) => s.setScript(e.target.value)}
        />
        <p className="note">
          <code>*word*</code> keyword · <code>|</code> or new line = new screen. Commas and periods are hidden.
        </p>
      </section>
      <section className="chunks">
        <div className="section-head">
          <h3>Screens ({chunks.length})</h3>
          {project.chunkTimes.length > 0 && (
            <button className="btn small ghost" onClick={s.clearChunkTimes} title="Make every time automatic again">
              Reset times
            </button>
          )}
        </div>
        {chunks.length === 0 && <p className="note">Your captions will be listed here.</p>}
        {chunks.map((c, i) => {
          const tc = timing[i]
          const active = tc && time >= tc.start && time < tc.end
          const ct = project.chunkTimes[i]
          return (
            <div key={i} className={`chunk ${active ? 'active' : ''}`} onClick={() => tc && s.setTime(tc.start)}>
              <div className="chunk-times" onClick={(e) => e.stopPropagation()}>
                <span className="chunk-n">{i + 1}</span>
                <TimeCell value={ct?.start ?? null} auto={tc?.start ?? 0} onChange={(v) => s.setChunkTime(i, 'start', v)} />
                <span className="dim">→</span>
                <TimeCell value={ct?.end ?? null} auto={tc?.end ?? 0} onChange={(v) => s.setChunkTime(i, 'end', v)} />
              </div>
              <div className="chunk-tokens" dir={c.rtl ? 'rtl' : 'ltr'}>
                {c.tokens.map((t) => (
                  <span key={t.index} className={`tok ${t.keyword ? 'kw' : ''}`}>{t.text}</span>
                ))}
              </div>
            </div>
          )
        })}
      </section>
    </aside>
  )
}
