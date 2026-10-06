import { useCallback, useEffect, useState } from 'react'
import { loadBrandFonts } from './fonts'
import { Preview } from './components/Preview'
import { ScriptPanel } from './components/ScriptPanel'
import { Sidebar } from './components/Sidebar'
import { Transport } from './components/Transport'
import { activeBrand, useStore } from './store'

/** Ask Chromium up front whether it can decode this codec. */
function canPreview(codec: string): boolean {
  const probe: Record<string, string> = { hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"', h264: 'video/mp4; codecs="avc1.640028"' }
  const type = probe[codec]
  return !type || document.createElement('video').canPlayType(type) !== ''
}

export function App() {
  const project = useStore((s) => s.project)
  const status = useStore((s) => s.status)
  const brand = useStore(activeBrand)
  const [dragOver, setDragOver] = useState(false)

  // Fonts must be registered before captions are measured and drawn.
  useEffect(() => {
    if (brand) loadBrandFonts(brand).then(() => useStore.getState().fontsLoaded())
  }, [brand])

  const makeProxy = useCallback(async () => {
    const s = useStore.getState()
    const v = s.project.video
    if (!v || s.project.previewPath !== v.path) return
    try {
      s.setStatus({ kind: 'busy', label: 'Making a preview copy (this codec cannot play directly)…', progress: 0 })
      const p = await window.api.makeProxy(v, (progress) =>
        useStore.getState().setStatus({ kind: 'busy', label: 'Making a preview copy…', progress })
      )
      useStore.getState().setPreviewPath(p)
      useStore.getState().setStatus({ kind: 'idle' })
    } catch (e) {
      useStore.getState().setStatus({ kind: 'error', message: (e as Error).message })
    }
  }, [])

  const openVideo = useCallback(async (path: string | null) => {
    if (!path) return
    const s = useStore.getState()
    try {
      s.setStatus({ kind: 'busy', label: 'Reading video…' })
      const info = await window.api.probe(path)
      s.loadVideo(info, info.path)
      if (!canPreview(info.codec)) await makeProxy()
      s.setStatus({ kind: 'busy', label: 'Looking for a black/silent ending…' })
      const tail = await window.api.deadTail(info)
      s.setDeadTail(tail)
      if (tail.outPoint != null) s.setOutPoint(tail.outPoint)
      s.setStatus({ kind: 'idle' })
    } catch (e) {
      s.setStatus({ kind: 'error', message: (e as Error).message })
    }
  }, [makeProxy])


  useEffect(() => {
    window.api.listBrands().then((b) => useStore.getState().setBrands(b))
    window.api.initialVideo().then(async (init) => {
      if (!init) return
      await openVideo(init.path)
      if (init.demo) useStore.getState().loadDemoScript()
      useStore.getState().setTime(init.time)
      if (init.play) setTimeout(() => useStore.getState().setPlaying(true), 300)
      setTimeout(() => window.api.idle(), 500)
    })
  }, [openVideo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const s = useStore.getState()
      if (!s.project.video) return
      const step = e.shiftKey ? 1 : 1 / 30
      switch (e.key) {
        case ' ': s.setPlaying(!s.playing); break
        case 'ArrowLeft': s.setPlaying(false); s.setTime(s.time - step); break
        case 'ArrowRight': s.setPlaying(false); s.setTime(s.time + step); break
        case 'i': case 'I': s.setInPoint(s.time); break
        case 'o': case 'O': s.setOutPoint(s.time); break
        case 'Home': s.setTime(s.project.inPoint); break
        case 'End': s.setTime(s.project.outPoint); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) openVideo(window.api.pathForFile(f))
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
        <span className="spacer" />
        {status.kind === 'busy' && (
          <span className="status">
            {status.label}
            {status.progress != null && ` ${Math.round(status.progress * 100)}%`}
          </span>
        )}
        {status.kind === 'error' && <span className="status error">{status.message}</span>}
        <span className="brand-chip" title={brand?.dir}>{brand ? brand.brand.name : 'No brand found'}</span>
      </header>

      {project.video ? (
        <main className="workspace">
          <ScriptPanel />
          <div className="stage">
            <Preview onUnsupported={makeProxy} />
            <Transport />
          </div>
          <Sidebar />
        </main>
      ) : (
        <main className="empty">
          <div className="dropzone">
            <h1>Open a vertical video</h1>
            <p>Drop an MP4 or MOV here, or</p>
            <button className="btn primary" onClick={async () => openVideo(await window.api.pickVideo())}>Choose a file…</button>
          </div>
        </main>
      )}
    </div>
  )
}
