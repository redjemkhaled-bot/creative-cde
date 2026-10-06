import { useCallback, useEffect, useState } from 'react'
import { analyse } from '@core/audioAnalysis'
import { newProject, type Project } from '@core/types'
import { loadBrandImages } from './assets'
import { BrandWizard } from './components/BrandWizard'
import { ExportDialog } from './components/ExportDialog'
import { Preview } from './components/Preview'
import { ScriptPanel } from './components/ScriptPanel'
import { Sidebar } from './components/Sidebar'
import { Timeline } from './components/Timeline'
import { Transport } from './components/Transport'
import { loadBrandFonts } from './fonts'
import { activeBrand, useStore } from './store'

/** Ask Chromium up front whether it can decode this codec. */
function canPreview(codec: string): boolean {
  const probe: Record<string, string> = { hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"', h264: 'video/mp4; codecs="avc1.640028"' }
  const type = probe[codec]
  return !type || document.createElement('video').canPlayType(type) !== ''
}

const st = () => useStore.getState()

async function makeProxy() {
  const s = st()
  const v = s.project.video
  if (!v || (s.project.previewPath && s.project.previewPath !== v.path)) return
  try {
    s.setStatus({ kind: 'busy', label: 'Making a preview copy (this codec cannot play directly)…', progress: 0 })
    const p = await window.api.makeProxy(v, (progress) => st().setStatus({ kind: 'busy', label: 'Making a preview copy…', progress }))
    st().setPreviewPath(p)
    st().setStatus({ kind: 'idle' })
  } catch (e) {
    st().setStatus({ kind: 'error', message: (e as Error).message })
  }
}

async function loadAnalysis(path: string) {
  const pcm = await window.api.pcm(path)
  if (!pcm || st().project.video?.path !== path) return
  const samples = new Float32Array(pcm.buffer as ArrayBuffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4))
  st().set({ analysis: analyse(samples, 8000) })
}

/** Open a video into the current project (script and events are kept). */
async function openVideo(path: string | null) {
  if (!path) return
  const s = st()
  try {
    s.setStatus({ kind: 'busy', label: 'Reading video…' })
    const info = await window.api.probe(path)
    s.loadVideo(info, info.path)
    if (!canPreview(info.codec)) await makeProxy()
    void loadAnalysis(info.path)
    st().setStatus({ kind: 'busy', label: 'Looking for a black/silent ending…' })
    const tail = await window.api.deadTail(info)
    st().set({ deadTail: tail })
    if (tail.outPoint != null) st().setOutPoint(tail.outPoint)
    st().setStatus({ kind: 'idle' })
  } catch (e) {
    st().setStatus({ kind: 'error', message: (e as Error).message })
  }
}

/** Load a project file or autosave; re-reads the video so it can be previewed. */
async function openProject(p: Project, path: string | null) {
  const s = st()
  s.replaceProject({ ...p, previewPath: null }, path)
  if (!p.video) return
  if (!(await window.api.exists(p.video.path))) {
    s.setStatus({ kind: 'error', message: `Video not found: ${p.video.path}. Use “Open video” to relink it.` })
    return
  }
  try {
    const info = await window.api.probe(p.video.path)
    st().replaceProject({ ...st().project, video: info, previewPath: info.path, outPoint: Math.min(p.outPoint || info.duration, info.duration) }, path)
    if (!canPreview(info.codec)) await makeProxy()
    void loadAnalysis(info.path)
    st().setStatus({ kind: 'info', message: `Opened ${path ? path.split(/[\\/]/).pop() : 'last session'}` })
  } catch (e) {
    st().setStatus({ kind: 'error', message: (e as Error).message })
  }
}

async function saveProject(as = false) {
  const s = st()
  let path = s.projectPath
  if (!path || as) {
    path = await window.api.pickProjectSave(`${s.project.name || 'reel'}.reel.json`)
    if (!path) return
  }
  await window.api.saveProject(path, s.project)
  st().set({ projectPath: path })
  st().setStatus({ kind: 'info', message: `Saved ${path.split(/[\\/]/).pop()}` })
}

/** Start or continue tap-to-time. */
function toggleTap() {
  const s = st()
  if (s.tapping) {
    s.set({ tapping: false, playing: false })
    return
  }
  const tapped = s.project.tokenTimes.filter((v) => v != null) as number[]
  if (tapped.length === 0) {
    // Fresh start: tapped word times replace screen times.
    s.edit((p) => ({ ...p, chunkTimes: [], tokenTimes: [] }))
    s.setTime(s.project.inPoint)
  } else s.setTime(Math.max(s.project.inPoint, Math.max(...tapped) - 1))
  s.set({ tapping: true, playing: true })
}

export function App() {
  const project = useStore((s) => s.project)
  const status = useStore((s) => s.status)
  const brands = useStore((s) => s.brands)
  const lb = useStore(activeBrand)
  const showExport = useStore((s) => s.showExport)
  const showWizard = useStore((s) => s.showBrandWizard)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const [dragOver, setDragOver] = useState(false)
  const [autoExport, setAutoExport] = useState<{ kind: 'mp4' | 'overlay'; out: string } | null>(null)

  // Fonts and images must be loaded before captions and overlays are drawn.
  useEffect(() => {
    if (!lb) return
    let alive = true
    Promise.all([loadBrandFonts(lb), loadBrandImages(lb)]).then(([, images]) => {
      if (alive) st().set({ images, assetsVersion: st().assetsVersion + 1 })
    })
    return () => { alive = false }
  }, [lb?.dir, lb?.products.join(), lb?.brand])

  // Startup: command line, else restore the last session.
  useEffect(() => {
    ;(async () => {
      st().set({ brands: await window.api.listBrands() })
      const init = await window.api.initial()
      if (init.project) await openProject(await window.api.loadProject(init.project), init.project)
      else if (init.video) await openVideo(init.video)
      else {
        const last = await window.api.loadAutosave()
        if (last?.project.video) await openProject(last.project, last.projectPath)
      }
      if (init.demo) st().loadDemo()
      if (init.time) st().setTime(init.time)
      if (init.play) setTimeout(() => st().setPlaying(true), 300)
      if (init.exportTo) {
        // Wait for fonts/images, then export headless (test hook).
        const wait = async () => { while (!st().images) await new Promise((r) => setTimeout(r, 100)) }
        await wait()
        setAutoExport({ kind: init.exportKind, out: init.exportTo })
        return
      }
      if (init.video || init.project) setTimeout(() => window.api.idle(), 900)
    })()
  }, [])

  // Autosave (and save to the project file once it has one).
  useEffect(() => {
    if (!project.video) return
    const h = setTimeout(() => {
      const s = st()
      void window.api.autosave(s.project, s.projectPath)
      if (s.projectPath) void window.api.saveProject(s.projectPath, s.project)
    }, 1500)
    return () => clearTimeout(h)
  }, [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && !!e.target.closest('input, textarea, select')
      const s = st()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void saveProject(e.shiftKey); return }
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); void pickProject(); return }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); if (s.project.video) s.set({ showExport: true }); return }
      if (typing) return
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return }
      if (!s.project.video || s.showExport || s.showBrandWizard) return
      const step = e.shiftKey ? 1 : 1 / 30
      if (s.tapping) {
        if (e.key === ' ') { e.preventDefault(); s.tapStamp(); return }
        if (e.key === 'Backspace') { e.preventDefault(); s.tapUndo(); return }
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); s.set({ tapping: false, playing: false }); return }
        if (e.key.toLowerCase() === 'p') { e.preventDefault(); s.setPlaying(!s.playing); return }
      }
      switch (e.key) {
        case ' ': s.setPlaying(!s.playing); break
        case 'ArrowLeft': s.setPlaying(false); s.setTime(s.time - step); break
        case 'ArrowRight': s.setPlaying(false); s.setTime(s.time + step); break
        case 'i': case 'I': s.setInPoint(s.time); break
        case 'o': case 'O': s.setOutPoint(s.time); break
        case 't': case 'T': toggleTap(); break
        case 'Home': s.setTime(s.project.inPoint); break
        case 'End': s.setTime(s.project.outPoint); break
        case 'Delete': if (s.selectedEvent) s.removeEvent(s.selectedEvent); break
        case 'Escape': s.set({ selectedEvent: null }); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickProject = useCallback(async () => {
    const path = await window.api.pickProjectOpen()
    if (path) await openProject(await window.api.loadProject(path), path)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    const path = window.api.pathForFile(f)
    if (/\.json$/i.test(path)) void window.api.loadProject(path).then((p) => openProject(p, path))
    else void openVideo(path)
  }

  return (
    <div
      className={`app ${dragOver ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <header className="topbar">
        <span className="logo">Reel Captioner</span>
        <button className="btn" onClick={async () => openVideo(await window.api.pickVideo())}>Open video…</button>
        <button className="btn ghost" onClick={pickProject} title="Ctrl+O">Open project…</button>
        <button className="btn ghost" onClick={() => saveProject()} disabled={!project.video} title="Ctrl+S (Ctrl+Shift+S: save as)">Save</button>
        <button className="btn ghost" onClick={() => { st().replaceProject({ ...newProject(project.brandId) }, null); st().set({ analysis: null }) }} title="Start a new empty project">New</button>
        <button className="btn ghost icon" onClick={() => st().undo()} disabled={!canUndo} title="Undo (Ctrl+Z)">↶</button>
        <button className="btn ghost icon" onClick={() => st().redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
        <span className="spacer" />
        {status.kind === 'busy' && <span className="status">{status.label}{status.progress != null && ` ${Math.round(status.progress * 100)}%`}</span>}
        {status.kind === 'error' && <span className="status error" onClick={() => st().setStatus({ kind: 'idle' })}>{status.message}</span>}
        {status.kind === 'info' && <span className="status ok">{status.message}</span>}
        <select
          className="select brand-select"
          value={lb?.brand.id ?? ''}
          title={lb?.dir}
          onChange={async (e) => {
            const v = e.target.value
            if (v === '__new') st().set({ showBrandWizard: true })
            else if (v === '__folder') await window.api.openBrandFolder(lb && !lb.builtIn ? lb.dir : null)
            else if (v === '__reload') st().set({ brands: await window.api.listBrands() })
            else st().setBrandId(v)
          }}
        >
          {brands.map((b) => <option key={b.brand.id} value={b.brand.id}>{b.brand.name}{b.builtIn ? '' : ' ★'}</option>)}
          <option value="__new">＋ New brand…</option>
          <option value="__folder">Open brands folder</option>
          <option value="__reload">Reload brands</option>
        </select>
        <button className="btn primary" disabled={!project.video} onClick={() => st().set({ showExport: true })} title="Ctrl+E">Export…</button>
      </header>

      {project.video ? (
        <main className="workspace">
          <ScriptPanel />
          <div className="stage">
            <Preview onUnsupported={makeProxy} />
          </div>
          <Sidebar />
          <div className="bottom">
            <Transport onTap={toggleTap} />
            <Timeline />
          </div>
        </main>
      ) : (
        <main className="empty">
          <div className="dropzone">
            <h1>Open a vertical video</h1>
            <p>Drop an MP4 / MOV (or a saved .reel.json project) here, or</p>
            <div className="callout-actions center">
              <button className="btn primary" onClick={async () => openVideo(await window.api.pickVideo())}>Choose a video…</button>
              <button className="btn" onClick={pickProject}>Open a project…</button>
            </div>
          </div>
        </main>
      )}
      {(showExport || autoExport) && <ExportDialog auto={autoExport ?? undefined} />}
      {showWizard && <BrandWizard />}
    </div>
  )
}
