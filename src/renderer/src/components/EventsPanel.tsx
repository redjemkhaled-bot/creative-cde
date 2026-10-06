import { newId, type EndCardProduct, type EventType, type ReelEvent, type Side } from '@core/types'
import { activeBrand, useStore } from '../store'
import { eventLabel } from './Timeline'
import { TimeInput } from './Sidebar'

const TYPES: { type: EventType; label: string; hint: string }[] = [
  { type: 'product', label: 'Product', hint: 'Product mockup that pops in and floats' },
  { type: 'zoomPunch', label: 'Zoom punch', hint: 'Quick zoom in and out' },
  { type: 'zoomHold', label: 'Zoom hold', hint: 'Zoom in, hold, zoom out' },
  { type: 'card', label: 'UI card', hint: 'White card with 3 thumbnails and a badge' },
  { type: 'pill', label: 'Pill', hint: 'Dark pill label with a dot' },
  { type: 'sparkles', label: 'Sparkles', hint: 'Gold and white stars around the caption' },
  { type: 'logoCard', label: 'Logo card', hint: 'Floating white card with the brand logo' }
]

function Num({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="num" type="number" step={step} min={min} max={max} value={+value.toFixed(3)}
        onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)} />
    </div>
  )
}

function ProductSelect({ value, onChange, products }: { value: string; onChange: (v: string) => void; products: string[] }) {
  const list = products.includes(value) || !value ? products : [value, ...products]
  return (
    <select className="select wide" value={value} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="">(none)</option>}
      {list.map((p) => <option key={p} value={p}>{p.replace(/\.[^.]+$/, '')}{products.includes(p) ? '' : ' (missing)'}</option>)}
    </select>
  )
}

function SideToggle({ value, onChange }: { value: Side; onChange: (s: Side) => void }) {
  return (
    <div className="field">
      <label>Enters from</label>
      <div className="seg">
        <button className={`btn small ${value === -1 ? 'on' : 'ghost'}`} onClick={() => onChange(-1)}>Left</button>
        <button className={`btn small ${value === 1 ? 'on' : 'ghost'}`} onClick={() => onChange(1)}>Right</button>
      </div>
    </div>
  )
}

function defaults(type: EventType, t: number, products: string[], services: string[]): ReelEvent {
  const id = newId()
  const p0 = products[0] ?? ''
  switch (type) {
    case 'product': return { id, type, product: p0, width: 360, start: t, end: t + 1.4, x: 220, y: 1000, side: -1, rotation: -6 }
    case 'zoomPunch': return { id, type, start: t, end: t + 0.45, amount: 1.07, centerY: 820 }
    case 'zoomHold': return { id, type, start: t, end: t + 1.5, amount: 1.1, centerY: 820, ramp: 0.25 }
    case 'card': return { id, type, start: t, end: t + 2, x: 540, y: 880, products: products.slice(0, 3), label: 'CONCEPTION' }
    case 'pill': return { id, type, start: t, end: t + 2.5, x: 330, y: 860, text: services[0] ?? 'Service' }
    case 'sparkles': return { id, type, start: t, end: t + 0.9, seed: Math.floor(t * 1000) % 100000, count: 7 }
    case 'logoCard': return { id, type, start: t, end: t + 3, x: 520, y: 390, width: 250 }
  }
}

function EventEditor({ ev, products }: { ev: ReelEvent; products: string[] }) {
  const s = useStore.getState()
  const up = (patch: Partial<ReelEvent>) => s.updateEvent(ev.id, patch)
  const time = useStore((st) => st.time)
  return (
    <div className="editor">
      <div className="editor-head">
        <b>{eventLabel(ev)}</b>
        <span className="spacer" />
        <button className="btn small ghost" title="Jump to start" onClick={() => s.setTime(ev.start)}>⇤</button>
        <button className="btn small ghost" onClick={() => s.addEvent({ ...ev, id: newId(), start: time, end: time + (ev.end - ev.start) } as ReelEvent)}>Duplicate at playhead</button>
        <button className="btn small danger" onClick={() => s.removeEvent(ev.id)}>Delete</button>
      </div>
      <div className="field"><label>Start (s)</label><TimeInput value={ev.start} step={0.01} onChange={(v) => up({ start: v, end: Math.max(v + 0.05, ev.end) })} /></div>
      <div className="field"><label>End (s)</label><TimeInput value={ev.end} step={0.01} onChange={(v) => up({ end: Math.max(ev.start + 0.05, v) })} /></div>
      <div className="field"><label /><button className="btn small ghost" onClick={() => up({ start: +time.toFixed(2), end: +(time + ev.end - ev.start).toFixed(2) })}>Move start to playhead</button></div>
      {ev.type === 'product' && (
        <>
          <div className="field"><label>Image</label><ProductSelect value={ev.product} products={products} onChange={(v) => up({ product: v })} /></div>
          <Num label="Width (px)" value={ev.width} min={40} onChange={(v) => up({ width: v })} step={10} />
          <Num label="Rotation (°)" value={ev.rotation} onChange={(v) => up({ rotation: v })} />
          <SideToggle value={ev.side} onChange={(v) => up({ side: v })} />
        </>
      )}
      {(ev.type === 'zoomPunch' || ev.type === 'zoomHold') && (
        <>
          <Num label="Zoom (×)" value={ev.amount} step={0.01} min={1} max={2} onChange={(v) => up({ amount: v })} />
          <Num label="Centre y (px)" value={ev.centerY} step={10} onChange={(v) => up({ centerY: v })} />
          {ev.type === 'zoomHold' && <Num label="Ramp (s)" value={ev.ramp} step={0.05} min={0.05} onChange={(v) => up({ ramp: v })} />}
        </>
      )}
      {ev.type === 'card' && (
        <>
          <div className="field"><label>Badge</label><input className="text" value={ev.label} onChange={(e) => up({ label: e.target.value })} /></div>
          {[0, 1, 2].map((i) => (
            <div className="field" key={i}><label>Thumbnail {i + 1}</label>
              <ProductSelect value={ev.products[i] ?? ''} products={products} onChange={(v) => {
                const list = ev.products.slice()
                list[i] = v
                up({ products: list.filter(Boolean) })
              }} />
            </div>
          ))}
        </>
      )}
      {ev.type === 'pill' && <div className="field"><label>Text</label><input className="text" value={ev.text} onChange={(e) => up({ text: e.target.value })} /></div>}
      {ev.type === 'sparkles' && (
        <>
          <Num label="Count" value={ev.count} min={1} max={30} onChange={(v) => up({ count: Math.round(v) })} />
          <Num label="Pattern (seed)" value={ev.seed} onChange={(v) => up({ seed: Math.round(v) })} />
        </>
      )}
      {ev.type === 'logoCard' && <Num label="Logo width (px)" value={ev.width} step={10} min={60} onChange={(v) => up({ width: v })} />}
      {'x' in ev && (
        <>
          <Num label="x (px)" value={ev.x} step={5} onChange={(v) => up({ x: v } as Partial<ReelEvent>)} />
          <Num label="y (px)" value={ev.y} step={5} onChange={(v) => up({ y: v } as Partial<ReelEvent>)} />
          <p className="note">Tip: drag it on the preview to move it.</p>
        </>
      )}
    </div>
  )
}

function EndCardEditor({ products }: { products: string[] }) {
  const ec = useStore((s) => s.project.endCard)
  const time = useStore((s) => s.time)
  const s = useStore.getState()
  const setProd = (i: number, patch: Partial<EndCardProduct>) =>
    s.setEndCard({ products: ec.products.map((p, j) => (j === i ? { ...p, ...patch } : p)) }, `ecp-${i}-${Object.keys(patch).join()}`)
  return (
    <section>
      <div className="section-head">
        <h3>End card</h3>
        <label className="check"><input type="checkbox" checked={ec.enabled} onChange={(e) => s.setEndCard({ enabled: e.target.checked, start: ec.start || time })} /> On</label>
      </div>
      {ec.enabled && (
        <>
          <div className="field"><label>Starts at (s)</label><TimeInput value={ec.start} step={0.01} onChange={(v) => s.setEndCard({ start: v })} /></div>
          <div className="field"><label /><button className="btn small ghost" onClick={() => s.setEndCard({ start: +time.toFixed(2) })}>Start at playhead</button></div>
          <Num label="Hold (s)" value={ec.hold} step={0.1} min={0.5} onChange={(v) => s.setEndCard({ hold: v })} />
          <p className="note">The last video frame stays underneath and the audio is padded.</p>
          <h4>Floating products ({ec.products.length}/4)</h4>
          {ec.products.map((p, i) => (
            <div key={i} className="ecprod">
              <div className="field"><ProductSelect value={p.product} products={products} onChange={(v) => setProd(i, { product: v })} />
                <button className="btn small ghost" onClick={() => s.setEndCard({ products: ec.products.filter((_, j) => j !== i) })}>✕</button></div>
              <div className="grid4">
                <label>x<input className="num" type="number" value={p.x} onChange={(e) => setProd(i, { x: e.target.valueAsNumber || 0 })} /></label>
                <label>y<input className="num" type="number" value={p.y} onChange={(e) => setProd(i, { y: e.target.valueAsNumber || 0 })} /></label>
                <label>width<input className="num" type="number" value={p.width} onChange={(e) => setProd(i, { width: e.target.valueAsNumber || 100 })} /></label>
                <label>delay<input className="num" type="number" step={0.05} value={p.delay} onChange={(e) => setProd(i, { delay: e.target.valueAsNumber || 0 })} /></label>
              </div>
            </div>
          ))}
          {ec.products.length < 4 && products.length > 0 && (
            <button className="btn small" onClick={() => s.setEndCard({
              products: [...ec.products, { product: products[0], width: 280, x: ec.products.length % 2 ? 880 : 190, y: ec.products.length < 2 ? 1650 : 350, side: ec.products.length % 2 ? 1 : -1, rotation: ec.products.length % 2 ? 8 : -8, delay: 0.55 + ec.products.length * 0.15 }]
            })}>+ Add product</button>
          )}
        </>
      )}
    </section>
  )
}

function WatermarkEditor() {
  const w = useStore((s) => s.project.watermark)
  const s = useStore.getState()
  return (
    <section>
      <div className="section-head">
        <h3>Watermark</h3>
        <label className="check"><input type="checkbox" checked={w.enabled} onChange={(e) => s.setWatermark({ enabled: e.target.checked })} /> On</label>
      </div>
      {w.enabled && (
        <>
          <Num label="Top (px)" value={w.y} step={10} onChange={(v) => s.setWatermark({ y: v })} />
          <Num label="Opacity" value={w.opacity} step={0.05} min={0} max={1} onChange={(v) => s.setWatermark({ opacity: v })} />
          <p className="note">Instagram icon + handle, top right. Hidden during the end card.</p>
        </>
      )}
    </section>
  )
}

export function EventsPanel() {
  const events = useStore((s) => s.project.events)
  const selected = useStore((s) => s.selectedEvent)
  const time = useStore((s) => s.time)
  const lb = useStore(activeBrand)
  const products = lb?.products ?? []
  const services = lb?.brand.services ?? []
  const s = useStore.getState()
  const sel = events.find((e) => e.id === selected)
  const sorted = [...events].sort((a, b) => a.start - b.start)

  const addServicePills = () => {
    const pos: [number, number][] = [[330, 860], [760, 860], [330, 975], [750, 975]]
    const end = time + 2.9
    services.slice(0, 4).forEach((text, i) =>
      s.addEvent({ id: newId(), type: 'pill', start: +(time + i * 0.6).toFixed(2), end: +end.toFixed(2), x: pos[i][0], y: pos[i][1], text })
    )
  }

  return (
    <>
      <section>
        <h3>Add at playhead ({time.toFixed(2)} s)</h3>
        <div className="addgrid">
          {TYPES.map((t) => (
            <button key={t.type} className="btn small" title={t.hint} onClick={() => s.addEvent(defaults(t.type, +time.toFixed(2), products, services))}>+ {t.label}</button>
          ))}
          {services.length > 0 && <button className="btn small" title="One pill per brand service, popping one after another" onClick={addServicePills}>+ Service pills</button>}
        </div>
        {products.length === 0 && <p className="note">This brand has no product images yet.</p>}
        {lb && !lb.builtIn && (
          <button className="btn small ghost" onClick={async () => {
            const files = await window.api.pickFiles('Add product images (transparent PNG)', ['png', 'webp'], true)
            if (files.length) useStore.getState().set({ brands: await window.api.addProducts(lb.dir, files) })
          }}>+ Add product images to this brand…</button>
        )}
      </section>
      {sel && <section><EventEditor key={sel.id} ev={sel} products={products} /></section>}
      <section>
        <h3>All events ({events.length})</h3>
        {sorted.length === 0 && <p className="note">No events yet. Add one above, or click “Load v1 demo” in the Script panel.</p>}
        <ul className="evlist">
          {sorted.map((e) => (
            <li key={e.id} className={e.id === selected ? 'on' : ''} onClick={() => { s.set({ selectedEvent: e.id }); s.setTime(e.start) }}>
              <span className={`dot ${e.type}`} />
              <span className="evname">{eventLabel(e)}</span>
              <span className="dim small">{e.start.toFixed(2)}–{e.end.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>
      <EndCardEditor products={products} />
      <WatermarkEditor />
    </>
  )
}
