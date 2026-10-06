import { app } from 'electron'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import type { Brand, LoadedBrand } from '@core/types'

const bundledRoot = () => (app.isPackaged ? join(process.resourcesPath, 'brands') : join(app.getAppPath(), 'brands'))
export const userBrandsRoot = () => join(app.getPath('userData'), 'brands')

/** Bundled brands, then the user's own; a user brand replaces a bundled one with the same id. */
export function listBrands(): LoadedBrand[] {
  const byId = new Map<string, LoadedBrand>()
  for (const [ri, root] of [bundledRoot(), userBrandsRoot()].entries()) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      const dir = join(root, name)
      const file = join(dir, 'brand.json')
      if (!existsSync(file)) continue
      try {
        const brand = JSON.parse(readFileSync(file, 'utf8')) as Brand
        const pdir = join(dir, 'products')
        const products = existsSync(pdir) ? readdirSync(pdir).filter((f) => /\.(png|webp)$/i.test(f)).sort() : []
        byId.set(brand.id, { dir, brand, products, builtIn: ri === 0 })
      } catch (e) {
        console.error(`Skipping brand ${dir}:`, e)
      }
    }
  }
  return [...byId.values()]
}

export interface NewBrandSpec {
  /** Copy every file from this brand folder first (optional). */
  baseDir: string | null
  brand: Brand
  /** Absolute paths of files to copy in; null keeps the base brand's file. */
  files: { logo: string | null; pattern: string | null; latin: string | null; latin2: string | null; arabic: string | null }
  products: string[]
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand'

/** Write a brand folder under the user's brands directory. */
export function createBrand(spec: NewBrandSpec): LoadedBrand[] {
  const brand: Brand = JSON.parse(JSON.stringify(spec.brand))
  brand.id = slug(brand.id || brand.name)
  const dir = join(userBrandsRoot(), brand.id)
  mkdirSync(join(dir, 'fonts'), { recursive: true })
  mkdirSync(join(dir, 'products'), { recursive: true })
  if (spec.baseDir && existsSync(spec.baseDir) && spec.baseDir !== dir) cpSync(spec.baseDir, dir, { recursive: true })
  const put = (src: string | null, sub: string, fallbackName: string): string | null => {
    if (!src) return null
    const name = sub ? `${sub}/${basename(src)}` : `${fallbackName}${extname(src).toLowerCase()}`
    copyFileSync(src, join(dir, name))
    return name
  }
  brand.logo.svg = put(spec.files.logo, '', 'logo') ?? brand.logo.svg
  brand.pattern = put(spec.files.pattern, '', 'pattern') ?? brand.pattern
  brand.fonts.latin.file = put(spec.files.latin, 'fonts', '') ?? brand.fonts.latin.file
  const l2 = put(spec.files.latin2, 'fonts', '')
  if (l2) brand.fonts.latin2 = { ...(brand.fonts.latin2 ?? {}), file: l2 }
  brand.fonts.arabic.file = put(spec.files.arabic, 'fonts', '') ?? brand.fonts.arabic.file
  for (const p of spec.products) copyFileSync(p, join(dir, 'products', basename(p)))
  writeFileSync(join(dir, 'brand.json'), JSON.stringify(brand, null, 2))
  return listBrands()
}

/** Copy product PNGs into a (user) brand's products folder. */
export function addProducts(dir: string, files: string[]): LoadedBrand[] {
  mkdirSync(join(dir, 'products'), { recursive: true })
  for (const f of files) copyFileSync(f, join(dir, 'products', basename(f)))
  return listBrands()
}
