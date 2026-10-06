export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3)
export const easeInCubic = (x: number): number => Math.pow(clamp01(x), 3)
export const easeInOutSine = (x: number): number => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2
const C1 = 1.70158
const C3 = C1 + 1
/** Overshoots slightly past 1 before settling. */
export const easeOutBack = (x: number): number => {
  const p = clamp01(x) - 1
  return 1 + C3 * p * p * p + C1 * p * p
}
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
