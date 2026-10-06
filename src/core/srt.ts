import { chunksFor, hideTime, timingFor } from './captions'
import type { Brand, Project } from './types'

const stamp = (t: number): string => {
  const ms = Math.max(0, Math.round(t * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const pad = (x: number, n = 2) => String(x).padStart(n, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`
}

/** One SRT cue per caption screen, timed relative to the in-point. */
export function buildSrt(project: Project, brand: Brand): string {
  const chunks = chunksFor(project, brand)
  const timing = timingFor(project, brand)
  return timing
    .map((tc, i) => {
      const text = chunks[tc.index].tokens.map((t) => t.text).join(' ')
      const a = tc.start - project.inPoint
      const b = hideTime(timing, i, project) - project.inPoint
      return `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}\n`
    })
    .join('\n')
}
