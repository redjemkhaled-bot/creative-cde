// Caption line layout — port of layout_chunk() in reference/render.py.

export interface LineLayout {
  /** Token positions (indexes into the chunk) on this line, in logical order. */
  tokens: number[]
  width: number
}

export interface ChunkLayout {
  lines: LineLayout[]
  /** Safety scale: only below 1 when a line would leave the 1080 px frame. */
  scale: number
}

const lineWidth = (w: number[], a: number, b: number, gap: number): number => {
  let s = 0
  for (let i = a; i < b; i++) s += w[i]
  return s + gap * Math.max(0, b - a - 1)
}

/**
 * One line if it fits in maxWidth; otherwise the 2-line split with the
 * narrowest widest line (first such split on ties), as render.py does.
 */
export function layoutChunk(widths: number[], gap: number, maxWidth: number, frameWidth = 1040): ChunkLayout {
  const n = widths.length
  const idx = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k)
  const total = lineWidth(widths, 0, n, gap)
  let lines: LineLayout[] = [{ tokens: idx(0, n), width: total }]
  if (total > maxWidth && n > 1) {
    let best = 1
    let bestScore = Infinity
    for (let k = 1; k < n; k++) {
      const sc = Math.max(lineWidth(widths, 0, k, gap), lineWidth(widths, k, n, gap))
      if (sc < bestScore) { bestScore = sc; best = k }
    }
    lines = [
      { tokens: idx(0, best), width: lineWidth(widths, 0, best, gap) },
      { tokens: idx(best, n), width: lineWidth(widths, best, n, gap) }
    ]
  }
  const widest = Math.max(...lines.map((l) => l.width))
  return { lines, scale: widest > frameWidth ? frameWidth / widest : 1 }
}

/**
 * Centre x of each token on a line. RTL lines put the first token at the right.
 */
export function placeLine(widths: number[], gap: number, centerX: number, rtl: boolean): number[] {
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widths.length - 1)
  let x = rtl ? centerX + total / 2 : centerX - total / 2
  return widths.map((w) => {
    const cx = rtl ? x - w / 2 : x + w / 2
    x = rtl ? x - w - gap : x + w + gap
    return cx
  })
}
