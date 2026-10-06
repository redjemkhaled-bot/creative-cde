import type { BrandImages } from '@core/effects'
import type { ImageLike } from '@core/sprites'
import type { LoadedBrand } from '@core/types'
import { mediaUrl } from './media'

let version = 0

async function loadImage(path: string): Promise<ImageLike | null> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = mediaUrl(path)
  try {
    await img.decode()
  } catch {
    console.error('Image failed to load:', path)
    return null
  }
  // SVGs without a size report 0: give them a sensible default.
  const width = img.naturalWidth || 1000
  const height = img.naturalHeight || 1000
  // Rasterise once so drawing (and alpha trimming) is fast and identical everywhere.
  const c = new OffscreenCanvas(width, height)
  c.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return { image: c, width, height }
}

/** Load a brand's products, pattern and logo. */
export async function loadBrandImages(lb: LoadedBrand): Promise<BrandImages> {
  const products = new Map<string, ImageLike>()
  await Promise.all(
    lb.products.map(async (f) => {
      const im = await loadImage(`${lb.dir}/products/${f}`)
      if (im) products.set(f, im)
    })
  )
  const [pattern, logo] = await Promise.all([
    lb.brand.pattern ? loadImage(`${lb.dir}/${lb.brand.pattern}`) : Promise.resolve(null),
    lb.brand.logo?.svg ? loadImage(`${lb.dir}/${lb.brand.logo.svg}`) : Promise.resolve(null)
  ])
  return { products, pattern, logo, version: ++version }
}
