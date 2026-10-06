import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { applyV1 } from '@core/demo'
import { animInOut, zoomAt, zoomBox } from '@core/effects'
import { encodeWav, renderSfx, sfxCues, synthPop, synthWhoosh } from '@core/sfx'
import { buildSrt } from '@core/srt'
import { frameCount, newProject, normalizeProject, reelEnd, type Brand } from '@core/types'

const brand: Brand = JSON.parse(readFileSync(resolve(__dirname, '../brands/redjem/brand.json'), 'utf8'))
const v1 = () => applyV1({ ...newProject('redjem'), name: 'Younes_Cadeaux_' }, brand.services)

describe('v1 reel', () => {
  it('has the approved length: 0 → 25.2 s video, end card at 24.10, total 26.2 s', () => {
    const p = v1()
    expect(p.outPoint).toBe(25.2)
    expect(p.endCard.start).toBe(24.1)
    expect(reelEnd(p)).toBeCloseTo(26.2)
    expect(frameCount(p)).toBe(786)
  })
  it('has every event from render.py', () => {
    const p = v1()
    const count = (t: string) => p.events.filter((e) => e.type === t).length
    expect(count('product')).toBe(9)
    expect(count('zoomPunch')).toBe(3)
    expect(count('zoomHold')).toBe(1)
    expect(count('card')).toBe(1)
    expect(count('pill')).toBe(4)
    expect(count('sparkles')).toBe(3)
    expect(count('logoCard')).toBe(1)
    expect(p.endCard.products).toHaveLength(4)
  })
  it('matches the project file in test/', () => {
    const file = resolve(__dirname, '../test/younes_v1.project.json')
    const p = v1()
    const disk = {
      ...p,
      video: { path: 'Younes_Cadeaux_.mp4', duration: 28.2, width: 1080, height: 1920, fps: 30, codec: 'h264', hasAudio: true }
    }
    if (process.env.WRITE_DEMO || !existsSync(file)) writeFileSync(file, JSON.stringify(disk, null, 2) + '\n')
    const loaded = normalizeProject(JSON.parse(readFileSync(file, 'utf8')))
    expect(loaded.events).toEqual(p.events)
    expect(loaded.endCard).toEqual(p.endCard)
    expect(loaded.script).toBe(p.script)
  })
})

describe('zoom (render.py zoom_at)', () => {
  const ev = v1().events
  it('punches peak mid-way and are 1 outside', () => {
    expect(zoomAt(4.4, ev).z).toBe(1)
    expect(zoomAt(4.5 + 0.225, ev).z).toBeCloseTo(1.07)
  })
  it('holds at 1.10 after the 0.25 s ramp', () => {
    expect(zoomAt(10.2, ev).z).toBeCloseTo(1.1)
    expect(zoomAt(9.5, ev).z).toBeCloseTo(1)
  })
  it('crops around y=820, clamped to the frame', () => {
    const b = zoomBox(1.1, 820)
    expect(b.w).toBeCloseTo(1080 / 1.1)
    // 820 - 1745/2 < 0, so the crop is clamped to the top of the frame.
    expect(b.y).toBe(0)
    expect(zoomBox(1.1, 1000).y).toBeCloseTo(1000 - 1920 / 1.1 / 2)
    expect(zoomBox(1.1, 1900).y).toBeCloseTo(1920 - 1920 / 1.1)
  })
})

describe('animation phases (render.py anim_in_out)', () => {
  it('enters, holds and exits', () => {
    expect(animInOut(0.9, 1, 2)).toBeNull()
    expect(animInOut(1.19, 1, 2)![0]).toBe('in')
    expect(animInOut(1.5, 1, 2)![0]).toBe('hold')
    expect(animInOut(2.1, 1, 2)![0]).toBe('out')
    expect(animInOut(2.3, 1, 2)).toBeNull()
  })
})

describe('sound effects', () => {
  it('pops on entries and whooshes on zooms and the end card', () => {
    const cues = sfxCues(v1())
    expect(cues.filter((c) => c.kind === 'pop')).toHaveLength(9 + 4 + 1 + 1 + 4)
    expect(cues.filter((c) => c.kind === 'whoosh')).toHaveLength(3 + 1 + 1)
  })
  it('synthesises a 90 ms decaying pop and a smooth whoosh', () => {
    const pop = synthPop()
    expect(pop.length).toBe(Math.floor(0.09 * 44100))
    expect(Math.abs(pop[pop.length - 1])).toBeLessThan(0.05)
    const w = synthWhoosh(0.5)
    expect(Math.abs(w[0])).toBeLessThan(1e-6)
    expect(Math.max(...w.map(Math.abs))).toBeGreaterThan(0.05)
  })
  it('renders a track the length of the reel and a valid WAV', () => {
    const p = v1()
    const track = renderSfx(p, p.inPoint, reelEnd(p))
    expect(track.length).toBe(Math.round(26.2 * 44100))
    const wav = encodeWav(track)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
  })
  it('is silent when switched off', () => {
    const p = v1()
    p.sfx.enabled = false
    expect(renderSfx(p, 0, 2).every((v) => v === 0)).toBe(true)
  })
})

describe('SRT', () => {
  it('writes one cue per screen with v1 timings', () => {
    const srt = buildSrt(v1(), brand)
    const cues = srt.trim().split('\n\n')
    expect(cues).toHaveLength(18)
    expect(cues[1]).toContain('00:00:02,150 --> ')
    expect(cues[1]).toContain('LA FOIRE')
  })
})
