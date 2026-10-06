// Resolves when every chunk and token appears.
// Sources, in priority order: tapped token times, then chunk start/end
// times, then automatic spreading by character length.

import type { Chunk } from './markup'

export interface ChunkTime { start: number | null; end: number | null }

export interface TimedToken { index: number; start: number; tapped: boolean }
export interface TimedChunk { index: number; start: number; end: number; tokens: TimedToken[] }

/** After the last token of the last chunk, keep it on screen this long. */
export const LAST_HOLD = 0.6

const weight = (s: string): number => Math.max(1, [...s].length)

/**
 * Fill unknown values in `known` by spreading them between their known
 * neighbours (or lo/hi at the ends) in proportion to `weights`. Value i is a
 * start time: item i begins after the weights of items before it.
 */
export function fillProportional(known: (number | null)[], weights: number[], lo: number, hi: number): number[] {
  const out = known.slice() as (number | null)[]
  const n = out.length
  let i = 0
  while (i < n) {
    if (out[i] !== null) { i++; continue }
    let j = i
    while (j < n && out[j] === null) j++
    // Gap is items i..j-1. It starts at the previous item's time (or lo) and
    // ends where item j starts (or hi).
    const left = i > 0 ? (out[i - 1] as number) : lo
    const right = j < n ? (out[j] as number) : hi
    // When i > 0 the previous item also occupies part of the span.
    const items = i > 0 ? [i - 1, ...range(i, j)] : range(i, j)
    const total = items.reduce((a, k) => a + weights[k], 0)
    let acc = 0
    for (const k of items) {
      if (k >= i) out[k] = left + ((right - left) * acc) / total
      acc += weights[k]
    }
    i = j
  }
  return out as number[]
}

const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, k) => a + k)

export function resolveTiming(
  chunks: Chunk[],
  chunkTimes: ChunkTime[],
  tokenTimes: (number | null)[],
  inPoint: number,
  outPoint: number
): TimedChunk[] {
  if (!chunks.length) return []
  // 1. Chunk starts: first tapped token, else explicit chunk start.
  const knownStart = chunks.map((c, i) => tokenTimes[c.tokens[0].index] ?? chunkTimes[i]?.start ?? null)
  const chunkW = chunks.map((c) => c.tokens.reduce((a, t) => a + weight(t.text), 0))
  const lo = inPoint + 0.2
  const hi = Math.max(lo + 0.5, outPoint - 0.3)
  const starts = fillProportional(knownStart, chunkW, lo, hi)

  return chunks.map((c, i) => {
    const start = starts[i]
    const lastTapped = [...c.tokens].reverse().map((t) => tokenTimes[t.index]).find((v) => v != null) ?? null
    const end =
      chunkTimes[i]?.end ??
      (i + 1 < chunks.length
        ? starts[i + 1]
        : lastTapped != null
          ? Math.max(lastTapped, start) + LAST_HOLD
          : Math.max(hi, start + 1))
    // 2. Token starts inside the chunk.
    const known = c.tokens.map((t, k) => (k === 0 ? start : tokenTimes[t.index] ?? null))
    const times = fillProportional(known, c.tokens.map((t) => weight(t.text)), start, end)
    return {
      index: i,
      start,
      end: Math.max(end, start + 0.1),
      tokens: c.tokens.map((t, k) => ({ index: t.index, start: times[k], tapped: tokenTimes[t.index] != null }))
    }
  })
}
