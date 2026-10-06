// Two-line balanced caption layout (port of layout_chunk() from render.py).

export interface LineLayout {
  /** Token positions (indexes into the chunk) on this line, in logical order. */
  tokens: number[]
  width: number
}

export interface ChunkLayout {
  lines: LineLayout[]
  /** Uniform scale applied when even the best split is wider than maxWidth. */
  scale: number
}

const lineWidth = (w: number[], a: number, b: number, gap: number): number => {
  let s = 0
  for (let i = a; i < b; i++) s += w[i]
  return s + gap * Math.max(0, b - a - 1)
}

/**
 * One line if it fits; otherwise the 2-line split whose lines are most equal
 * (and both fit). If nothing fits, the split with the narrowest widest line,
 * scaled down to maxWidth.
 */
export function layoutChunk(widths: number[], gap: number, maxWidth: number): ChunkLayout {
  const n = widths.length
  const all = lineWidth(widths, 0, n, gap)
  const idx = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k)
  if (n <= 1 || all <= maxWidth) return { lines: [{ tokens: idx(0, n), width: all }], scale: Math.min(1, maxWidth / all) }
  let best = 1
  let bestFits = false
  let bestScore = Infinity
  for (let k = 1; k < n; k++) {
    const a = lineWidth(widths, 0, k, gap)
    const b = lineWidth(widths, k, n, gap)
    const fits = Math.max(a, b) <= maxWidth
    const score = fits ? Math.abs(a - b) : Math.max(a, b)
    if ((fits && !bestFits) || (fits === bestFits && score < bestScore)) {
      best = k
      bestFits = fits
      bestScore = score
    }
  }
  const lines = [
    { tokens: idx(0, best), width: lineWidth(widths, 0, best, gap) },
    { tokens: idx(best, n), width: lineWidth(widths, best, n, gap) }
  ]
  const widest = Math.max(lines[0].width, lines[1].width)
  return { lines, scale: widest > maxWidth ? maxWidth / widest : 1 }
}

/**
 * Left x of each token on a line. RTL lines put the first token at the right.
 */
export function placeLine(widths: number[], gap: number, centerX: number, rtl: boolean): number[] {
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widths.length - 1)
  const xs: number[] = []
  if (rtl) {
    let x = centerX + total / 2
    for (const w of widths) { x -= w; xs.push(x); x -= gap }
  } else {
    let x = centerX - total / 2
    for (const w of widths) { xs.push(x); x += w + gap }
  }
  return xs
}
