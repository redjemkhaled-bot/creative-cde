import { useEffect, useRef, useState } from 'react'
import { buildSrt } from '@core/srt'
import { reelEnd } from '@core/types'
import { runExport, type Progress } from '../exporter'
import { activeBrand, useStore } from '../store'

type Kind = 'mp4' | 'overlay' | 'srt'
const EXT: Record<Kind, string> = { mp4: 'mp4', overlay: 'mov', srt: 'srt' }

const KINDS: { id: Kind; title: string; desc: string }[] = [
  { id: 'mp4', title: 'Finished reel (MP4)', desc: '1080×1920, 30 fps, H.264 + AAC. Ready for Instagram.' },
  { id: 'overlay', title: 'Overlay only (ProRes 4444 .mov)', desc: 'Transparent captions + graphics + SFX, for DaVinci Resolve / Premiere.' },
  { id: 'srt', title: 'Captions only (SRT)', desc: 'Subtitle file with one line per caption screen.' }
]

const fmtEta = (s: number | null) => (s == null ? '…' : s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${Math.ceil(s % 60)} s`)

/** Export the current project. `auto` runs immediately (test hook) and quits. */
export function ExportDialog({ auto }: { auto?: { kind: 'mp4' | 'overlay'; out: string } }) {
  const project = useStore((s) => s.project)
  const lb = useStore(activeBrand)
  const [kind, setKind] = useState<Kind>(auto?.kind ?? 'mp4')
  const [dir, setDir] = useState<string | null>(null)
  const [out, setOut] = useState<string>('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)
  const running = progress != null && !done && !error

  useEffect(() => {
    if (auto) return
    ;(async () => {
      const d = dir ?? (project.video ? await window.api.dirname(project.video.path) : null)
      if (!d) return
      if (!dir) setDir(d)
      setOut(await window.api.suggestExportPath(d, project.name || 'reel', EXT[kind]))
    })()
  }, [kind, dir, project.name, done])

  const close = () => !running && useStore.getState().set({ showExport: false })

  const start = async (k: Kind = kind, path = out) => {
    if (!lb) return
    setError(null)
    setDone(null)
    cancelled.current = false
    if (k === 'srt') {
      await window.api.writeText(path, buildSrt(project, lb.brand))
      setDone(path)
      return
    }
    setProgress({ done: 0, total: 1, eta: null, fps: 0 })
    try {
      const images = useStore.getState().images
      const t0 = performance.now()
      const result = await runExport(project, lb.brand, images, k, path, setProgress, () => cancelled.current)
      console.log(`EXPORT_DONE ${result} in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
      setDone(result)
      if (auto) window.api.quit()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg === 'cancelled' ? 'Export cancelled.' : msg)
      setProgress(null)
      if (auto) {
        console.log(`EXPORT_FAILED ${msg}`)
        window.api.quit()
      }
    }
  }

  useEffect(() => {
    if (auto) void start(auto.kind, auto.out)
  }, [])

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>
        {!running && !done && (
          <>
            <div className="kinds">
              {KINDS.map((k) => (
                <label key={k.id} className={`kind ${kind === k.id ? 'on' : ''}`}>
                  <input type="radio" name="kind" checked={kind === k.id} onChange={() => setKind(k.id)} />
                  <div><b>{k.title}</b><div className="dim small">{k.desc}</div></div>
                </label>
              ))}
            </div>
            <div className="field"><label>Length</label><span>{(reelEnd(project) - project.inPoint).toFixed(2)} s</span></div>
            <div className="field">
              <label>Save as</label>
              <span className="filepick">
                <span className="small" title={out}>{out.split(/[\\/]/).pop()}</span>
                <button className="btn small ghost" onClick={async () => { const d = await window.api.pickFolder('Export folder'); if (d) setDir(d) }}>Change folder…</button>
              </span>
            </div>
            <p className="dim small" title={dir ?? ''}>Folder: {dir}</p>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={close}>Close</button>
              <button className="btn primary" disabled={!out} onClick={() => start()}>Export</button>
            </div>
          </>
        )}
        {running && progress && (
          <>
            <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            <div className="field">
              <span>{pct}% · frame {progress.done} / {progress.total}</span>
              <span className="dim">{progress.fps ? `${progress.fps.toFixed(1)} fps · ` : ''}about {fmtEta(progress.eta)} left</span>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => (cancelled.current = true)}>Cancel</button>
            </div>
          </>
        )}
        {done && (
          <>
            <p>✅ Saved <b>{done.split(/[\\/]/).pop()}</b></p>
            <div className="modal-actions">
              <button className="btn" onClick={() => window.api.showItem(done)}>Show in folder</button>
              <button className="btn ghost" onClick={() => { setDone(null); setProgress(null) }}>Export another</button>
              <button className="btn primary" onClick={() => useStore.getState().set({ showExport: false })}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
