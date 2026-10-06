import { describe, expect, it } from 'vitest'
import { parseSilence, proposeOutPoint } from '@core/deadTail'
import { coverRect } from '@core/drawFrame'
import { formatTime, parseRate, snapToFrame } from '@core/time'

describe('dead tail', () => {
  it('proposes the point where black and silence have both started', () => {
    const log = 'black_start: 25.200 black_end: 28.200\nsilence_start: 25.150\n'
    expect(proposeOutPoint(log, 28.2, true).outPoint).toBeCloseTo(25.2, 5)
  })
  it('ignores black frames in the middle of the video', () => {
    const log = 'black_start: 3.0 black_end: 4.0\nsilence_start: 3.0\nsilence_end: 4.0\n'
    expect(proposeOutPoint(log, 28.2, true).outPoint).toBeNull()
  })
  it('needs silence too when the video has audio', () => {
    expect(proposeOutPoint('black_start: 25.2 black_end: 28.2', 28.2, true).outPoint).toBeNull()
    expect(proposeOutPoint('black_start: 25.2 black_end: 28.2', 28.2, false).outPoint).toBeCloseTo(25.2)
  })
  it('closes an open silence at the end of the file', () => {
    expect(parseSilence('silence_start: 10\n', 12)).toEqual([{ start: 10, end: 12 }])
  })
})

describe('helpers', () => {
  it('formats and snaps time', () => {
    expect(formatTime(65.5)).toBe('01:05.50')
    expect(snapToFrame(25.22)).toBeCloseTo(25.2333, 3)
    expect(parseRate('30000/1001')).toBeCloseTo(29.97, 2)
  })
  it('cover-fits landscape and portrait sources into 1080x1920', () => {
    expect(coverRect(1080, 1920)).toEqual({ x: 0, y: 0, w: 1080, h: 1920 })
    const r = coverRect(1920, 1080)
    expect(r.h).toBe(1920)
    expect(r.x).toBeLessThan(0)
  })
})
