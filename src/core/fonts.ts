import type { Brand } from './types'

export type FontRole = 'latin' | 'latin2' | 'arabic'

/** CSS family name under which a brand font is registered. */
export const fontFamily = (brand: Brand, role: FontRole): string => `rc-${brand.id}-${role}`

/** Weight used when drawing: brand value, else 800 for Latin, 900 for Arabic. */
export const fontWeight = (brand: Brand, role: FontRole): number =>
  brand.fonts[role]?.weight ?? (role === 'arabic' ? 900 : role === 'latin' ? 800 : 600)

/** Resolve a colour name ("gold") through brand.colors; pass hex through. */
export const color = (brand: Brand, c: string): string => brand.colors[c] ?? c
