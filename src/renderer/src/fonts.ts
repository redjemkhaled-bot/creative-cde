import { clearLayoutCache } from '@core/captions'
import { fontFamily, type FontRole } from '@core/fonts'
import { clearSprites } from '@core/sprites'
import type { LoadedBrand } from '@core/types'
import { mediaUrl } from './media'

const loaded = new Set<string>()

/** Register a brand's font files with the document so canvas can use them. */
export async function loadBrandFonts(lb: LoadedBrand): Promise<void> {
  const roles: FontRole[] = ['latin', 'latin2', 'arabic']
  await Promise.all(
    roles.map(async (role) => {
      const spec = lb.brand.fonts[role]
      if (!spec) return
      const family = fontFamily(lb.brand, role)
      const key = `${family}|${lb.dir}|${spec.file}`
      if (loaded.has(key)) return
      // Variable fonts (Cairo) cover a weight range; static ones serve any weight.
      const face = new FontFace(family, `url("${mediaUrl(`${lb.dir}/${spec.file}`)}")`, { weight: '1 1000' })
      try {
        document.fonts.add(await face.load())
        loaded.add(key)
      } catch (e) {
        console.error(`Font ${spec.file} failed to load`, e)
      }
    })
  )
  clearLayoutCache()
  clearSprites()
}
