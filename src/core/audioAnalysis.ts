// Speech envelope analysis for the timeline: waveform peaks, RMS in dB,
// pauses (quiet >= 0.25 s at about -32 dB) and onsets (speech starts).

export const HOP = 0.01 // seconds per analysis frame

export interface AudioAnalysis {
  rate: number
  duration: number
  /** Peak |sample| per HOP. */
  peaks: Float32Array
  /** RMS level in dBFS per HOP. */
  db: Float32Array
  pauses: { start: number; end: number }[]
  onsets: number[]
}

export function analyse(samples: Float32Array, rate: number, quietDb = -32, minPause = 0.25): AudioAnalysis {
  const hop = Math.max(1, Math.round(rate * HOP))
  const frames = Math.ceil(samples.length / hop)
  const peaks = new Float32Array(frames)
  const db = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let pk = 0
    let sq = 0
    const a = f * hop
    const b = Math.min(samples.length, a + hop)
    for (let i = a; i < b; i++) {
      const v = samples[i]
      const av = v < 0 ? -v : v
      if (av > pk) pk = av
      sq += v * v
    }
    peaks[f] = pk
    db[f] = 10 * Math.log10(sq / Math.max(1, b - a) + 1e-10)
  }
  // Pauses: runs of quiet frames.
  const pauses: { start: number; end: number }[] = []
  let runStart = -1
  for (let f = 0; f <= frames; f++) {
    const quiet = f < frames && db[f] < quietDb
    if (quiet && runStart < 0) runStart = f
    if (!quiet && runStart >= 0) {
      if ((f - runStart) * HOP >= minPause) pauses.push({ start: runStart * HOP, end: f * HOP })
      runStart = -1
    }
  }
  // Onsets: level rises by > 6 dB over 50 ms from a local low, above the quiet line.
  const onsets: number[] = []
  const look = 5
  let last = -1
  for (let f = look; f < frames; f++) {
    const rise = db[f] - db[f - look]
    if (db[f] > quietDb && rise > 6 && (last < 0 || f - last > 12)) {
      // Step back to where the rise began.
      let s = f - look
      while (s + 1 < f && db[s + 1] - db[s] < 1) s++
      onsets.push(s * HOP)
      last = f
    }
  }
  return { rate, duration: samples.length / rate, peaks, db, pauses, onsets }
}

/** Points the timeline snaps to: onsets and pause edges, sorted. */
export function snapPoints(a: AudioAnalysis): number[] {
  const pts = [...a.onsets]
  for (const p of a.pauses) pts.push(p.start, p.end)
  return pts.sort((x, y) => x - y)
}

/** Nearest snap point within `tol` seconds, else t. */
export function snap(t: number, points: number[], tol: number): number {
  let best = t
  let bestD = tol
  // Binary search for the insertion point, check neighbours.
  let lo = 0, hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid] < t) lo = mid + 1
    else hi = mid
  }
  for (const i of [lo - 1, lo]) {
    if (i >= 0 && i < points.length && Math.abs(points[i] - t) < bestD) {
      bestD = Math.abs(points[i] - t)
      best = points[i]
    }
  }
  return best
}
