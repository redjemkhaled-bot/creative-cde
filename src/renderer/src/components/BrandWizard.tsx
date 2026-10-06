import { useState } from 'react'
import type { Brand } from '@core/types'
import { activeBrand, useStore } from '../store'

type FileKey = 'logo' | 'pattern' | 'latin' | 'latin2' | 'arabic'

const FILES: { key: FileKey; label: string; exts: string[] }[] = [
  { key: 'logo', label: 'Logo (SVG or PNG)', exts: ['svg', 'png'] },
  { key: 'pattern', label: 'Background pattern', exts: ['png', 'jpg', 'jpeg', 'webp'] },
  { key: 'latin', label: 'Latin font (captions)', exts: ['ttf', 'otf'] },
  { key: 'latin2', label: 'Latin font 2 (pills, handle)', exts: ['ttf', 'otf'] },
  { key: 'arabic', label: 'Arabic font', exts: ['ttf', 'otf'] }
]

const COLORS = ['navy', 'mint', 'gold', 'white'] as const
const COLOR_HELP: Record<(typeof COLORS)[number], string> = {
  navy: 'Dark: caption outline, cards, pills',
  mint: 'Accent: pill dots',
  gold: 'Highlight: keywords, badge dot',
  white: 'Caption text'
}

const blankBrand = (): Brand => ({
  id: '', name: '', colors: { navy: '#112335', mint: '#87C9B7', gold: '#F2C83F', white: '#FFFFFF' },
  fonts: { latin: { file: '', size: 70 }, latin2: { file: '' }, arabic: { file: '', weight: 900, size: 84 } },
  caption: { fill: 'white', keyword: 'gold', stroke: 'navy', strokeWidth: 4, keywordScale: 1.12, uppercaseLatin: true, centerY: 1330, maxWidth: 960, lineHeight: 118, wordGap: 26 },
  logo: { svg: '' }, pattern: '', handle: '@', phone: '', website: '',
  endCard: { taglineTop: '', taglineBottom: '' }, services: []
})

export function BrandWizard() {
  const current = useStore(activeBrand)
  const [base, setBase] = useState<'current' | 'blank'>(current ? 'current' : 'blank')
  const [b, setB] = useState<Brand>(() => {
    const src = current ? (JSON.parse(JSON.stringify(current.brand)) as Brand) : blankBrand()
    return { ...src, id: '', name: current ? `${current.brand.name} (my copy)` : '' }
  })
  const [files, setFiles] = useState<Record<FileKey, string | null>>({ logo: null, pattern: null, latin: null, latin2: null, arabic: null })
  const [products, setProducts] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const close = () => useStore.getState().set({ showBrandWizard: false })
  const upd = (patch: Partial<Brand>) => setB((x) => ({ ...x, ...patch }))

  const switchBase = (v: 'current' | 'blank') => {
    setBase(v)
    if (v === 'blank') setB({ ...blankBrand(), name: b.name })
    else if (current) setB({ ...JSON.parse(JSON.stringify(current.brand)), id: '', name: b.name })
  }

  const create = async () => {
    setError(null)
    if (!b.name.trim()) return setError('Give the brand a name.')
    if (base === 'blank') {
      const missing = (['logo', 'latin', 'arabic'] as FileKey[]).filter((k) => !files[k])
      if (missing.length) return setError(`Choose: ${missing.map((m) => FILES.find((f) => f.key === m)!.label).join(', ')}.`)
    }
    try {
      const brands = await window.api.createBrand({
        baseDir: base === 'current' ? current?.dir ?? null : null,
        brand: { ...b, id: b.id || b.name },
        files,
        products
      })
      const s = useStore.getState()
      s.set({ brands, showBrandWizard: false })
      const created = brands.find((x) => !x.builtIn && x.brand.name === b.name) ?? brands[brands.length - 1]
      s.setBrandId(created.brand.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>New brand</h2>
        <div className="field">
          <label>Start from</label>
          <div className="seg">
            {current && <button className={`btn small ${base === 'current' ? 'on' : 'ghost'}`} onClick={() => switchBase('current')}>Copy of {current.brand.name}</button>}
            <button className={`btn small ${base === 'blank' ? 'on' : 'ghost'}`} onClick={() => switchBase('blank')}>Blank</button>
          </div>
        </div>
        <p className="note">Copying keeps every file of the current brand; you only replace what you choose below (e.g. your real logo and product photos).</p>
        <div className="wiz-grid">
          <div>
            <h4>Identity</h4>
            <div className="field"><label>Name</label><input className="text" value={b.name} onChange={(e) => upd({ name: e.target.value })} /></div>
            <div className="field"><label>Handle</label><input className="text" value={b.handle} onChange={(e) => upd({ handle: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input className="text" value={b.phone} onChange={(e) => upd({ phone: e.target.value })} /></div>
            <div className="field"><label>Website</label><input className="text" value={b.website} onChange={(e) => upd({ website: e.target.value })} /></div>
            <div className="field"><label>Tagline line 1</label><input className="text" value={b.endCard.taglineTop} onChange={(e) => upd({ endCard: { ...b.endCard, taglineTop: e.target.value } })} /></div>
            <div className="field"><label>Tagline line 2</label><input className="text" value={b.endCard.taglineBottom} onChange={(e) => upd({ endCard: { ...b.endCard, taglineBottom: e.target.value } })} /></div>
            <div className="field"><label>Services</label><input className="text" placeholder="Comma separated" value={b.services.join(', ')} onChange={(e) => upd({ services: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>
            <h4>Colours</h4>
            {COLORS.map((c) => (
              <div className="field" key={c} title={COLOR_HELP[c]}>
                <label>{c[0].toUpperCase() + c.slice(1)} <span className="dim small">{COLOR_HELP[c]}</span></label>
                <input type="color" value={b.colors[c] ?? '#000000'} onChange={(e) => upd({ colors: { ...b.colors, [c]: e.target.value.toUpperCase() } })} />
              </div>
            ))}
          </div>
          <div>
            <h4>Files</h4>
            {FILES.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <span className="filepick">
                  <span className="dim small" title={files[f.key] ?? ''}>{files[f.key] ? files[f.key]!.split(/[\\/]/).pop() : base === 'current' ? 'keep current' : 'none'}</span>
                  <button className="btn small ghost" onClick={async () => {
                    const [p] = await window.api.pickFiles(f.label, f.exts)
                    if (p) setFiles((x) => ({ ...x, [f.key]: p }))
                  }}>Choose…</button>
                </span>
              </div>
            ))}
            <div className="field"><label>Arabic weight</label>
              <input className="num" type="number" step={100} min={100} max={1000} value={b.fonts.arabic.weight ?? 900}
                onChange={(e) => upd({ fonts: { ...b.fonts, arabic: { ...b.fonts.arabic, weight: e.target.valueAsNumber || 900 } } })} /></div>
            <div className="field"><label>Arabic size / Latin size</label>
              <span>
                <input className="num tiny" type="number" value={b.fonts.arabic.size ?? 84} onChange={(e) => upd({ fonts: { ...b.fonts, arabic: { ...b.fonts.arabic, size: e.target.valueAsNumber || 84 } } })} />
                {' '}
                <input className="num tiny" type="number" value={b.fonts.latin.size ?? 70} onChange={(e) => upd({ fonts: { ...b.fonts, latin: { ...b.fonts.latin, size: e.target.valueAsNumber || 70 } } })} />
              </span>
            </div>
            <label className="check"><input type="checkbox" checked={b.caption.uppercaseLatin} onChange={(e) => upd({ caption: { ...b.caption, uppercaseLatin: e.target.checked } })} /> French / Latin words in CAPITALS</label>
            <h4>Product images</h4>
            <div className="field">
              <label>{products.length ? `${products.length} new image(s)` : base === 'current' ? 'keep current' : 'none'}</label>
              <button className="btn small ghost" onClick={async () => {
                const p = await window.api.pickFiles('Product images (transparent PNG)', ['png', 'webp'], true)
                if (p.length) setProducts(p)
              }}>Choose…</button>
            </div>
            <p className="note">Tip: name products like <code>products-11.png</code> to keep the v1 demo working with your real images.</p>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => window.api.openBrandFolder(null)}>Open brands folder</button>
          <span className="spacer" />
          <button className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={create}>Create brand</button>
        </div>
      </div>
    </div>
  )
}
