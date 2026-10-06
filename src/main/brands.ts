import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Brand, LoadedBrand } from '@core/types'

/** Folders that may contain brand folders: bundled ones, then the user's own. */
export function brandRoots(): string[] {
  const bundled = app.isPackaged ? join(process.resourcesPath, 'brands') : join(app.getAppPath(), 'brands')
  return [bundled, join(app.getPath('userData'), 'brands')]
}

export function listBrands(): LoadedBrand[] {
  const out: LoadedBrand[] = []
  for (const root of brandRoots()) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      const dir = join(root, name)
      const file = join(dir, 'brand.json')
      if (!existsSync(file)) continue
      try {
        const brand = JSON.parse(readFileSync(file, 'utf8')) as Brand
        const pdir = join(dir, 'products')
        const products = existsSync(pdir) ? readdirSync(pdir).filter((f) => /\.png$/i.test(f)).sort() : []
        out.push({ dir, brand, products })
      } catch (e) {
        console.error(`Skipping brand ${dir}:`, e)
      }
    }
  }
  return out
}
