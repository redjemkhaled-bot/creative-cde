// Parses ffmpeg blackdetect + silencedetect log output and proposes an
// out-point when the video ends in black AND silence.

import type { DeadTail } from './types'
import { snapToFrame } from './time'

interface Interval { start: number; end: number }

export function parseBlack(log: string): Interval[] {
  const out: Interval[] = []
  const re = /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(log))) out.push({ start: +m[1], end: +m[2] })
  return out
}

export function parseSilence(log: string, duration: number): Interval[] {
  const out: Interval[] = []
  const re = /silence_(start|end):\s*(-?[\d.]+)/g
  let open: number | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(log))) {
    if (m[1] === 'start') open = Math.max(0, +m[2])
    else if (open !== null) { out.push({ start: open, end: +m[2] }); open = null }
  }
  // silencedetect never prints silence_end when the file ends silent.
  if (open !== null) out.push({ start: open, end: duration })
  return out
}

/**
 * Tail is "dead" if the last black interval and the last silent interval both
 * run to the end of the file. The out-point is where both have begun.
 * A video without audio only needs the black tail.
 */
export function proposeOutPoint(log: string, duration: number, hasAudio: boolean, tol = 0.25): DeadTail {
  const atEnd = (i: Interval) => duration - i.end <= tol
  const black = parseBlack(log).filter(atEnd).pop() ?? null
  const silence = hasAudio ? parseSilence(log, duration).filter(atEnd).pop() ?? null : null
  const blackStart = black ? black.start : null
  const silenceStart = silence ? silence.start : null
  let outPoint: number | null = null
  if (blackStart !== null && (silenceStart !== null || !hasAudio)) {
    outPoint = snapToFrame(Math.max(blackStart, silenceStart ?? 0))
    if (outPoint <= 0.5) outPoint = null // whole video is dead; don't propose
  }
  return { outPoint, blackStart, silenceStart }
}
