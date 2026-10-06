import { describe, expect, it } from 'vitest'
import { V1_CHUNK_TIMES, V1_SCRIPT } from '@core/demo'
import { layoutChunk, placeLine } from '@core/layout'
import { parseScript } from '@core/markup'
import { fillProportional, resolveTiming } from '@core/timing'

describe('markup', () => {
  it('splits chunks on lines and |, keeps starred phrases as one keyword token', () => {
    const c = parseScript('حاب تبان في *la foire* تاعك | second, line.\nthird?')
    expect(c.map((x) => x.tokens.map((t) => t.text))).toEqual([
      ['حاب', 'تبان', 'في', 'LA FOIRE', 'تاعك'],
      ['SECOND', 'LINE'],
      ['THIRD?']
    ])
    expect(c[0].tokens[3].keyword).toBe(true)
    expect(c[0].rtl).toBe(true)
    expect(c[1].rtl).toBe(false)
  })
  it('uppercases French with accents, leaves Arabic alone, keeps ؟', () => {
    const [c] = parseScript("*l'équipe infographie* ما عندكش؟")
    expect(c.tokens.map((t) => t.text)).toEqual(["L'ÉQUIPE INFOGRAPHIE", 'ما', 'عندكش؟'])
  })
  it('can keep Latin case when the brand says so', () => {
    expect(parseScript('Redjem Studio', false)[0].tokens[0].text).toBe('Redjem')
  })
  it('parses the v1 script into 18 screens', () => {
    const c = parseScript(V1_SCRIPT)
    expect(c).toHaveLength(V1_CHUNK_TIMES.length)
    expect(c[15].tokens.map((t) => t.text)).toEqual(['عند', 'REDJEM STUDIO'])
  })
})

describe('layout', () => {
  it('keeps short chunks on one line', () => {
    expect(layoutChunk([200, 200], 20, 960).lines).toHaveLength(1)
  })
  it('splits long chunks into the most balanced two lines', () => {
    const l = layoutChunk([300, 300, 300, 300], 20, 960)
    expect(l.lines.map((x) => x.tokens)).toEqual([[0, 1], [2, 3]])
    expect(l.scale).toBe(1)
  })
  it('picks the split with the narrowest widest line (render.py)', () => {
    expect(layoutChunk([500, 100, 100, 400], 26, 960).lines.map((x) => x.tokens)).toEqual([[0, 1], [2, 3]])
  })
  it('only scales down when a line would leave the frame', () => {
    expect(layoutChunk([1000], 26, 960).scale).toBe(1)
    expect(layoutChunk([1200, 1200], 20, 960).scale).toBeCloseTo(1040 / 1200)
  })
  it('places RTL lines with the first token on the right', () => {
    const ltr = placeLine([100, 200], 20, 540, false)
    const rtl = placeLine([100, 200], 20, 540, true)
    expect(ltr[0]).toBeLessThan(ltr[1])
    expect(rtl[0]).toBeGreaterThan(rtl[1])
    // Mirror images of each other around the centre.
    expect(rtl[0]).toBeCloseTo(1080 - ltr[0])
  })
})

describe('timing', () => {
  it('spreads unknown values by weight between known neighbours', () => {
    expect(fillProportional([0, null, null, 10], [1, 1, 2, 1], 0, 99)).toEqual([0, 2.5, 5, 10])
  })
  it('spreads words over 90% of the chunk by max(2, length), like render.py', () => {
    const chunks = parseScript('a bbbb cc')
    const [c] = resolveTiming(chunks, [{ start: 1, end: 3 }], [], 0, 10)
    expect(c.start).toBe(1)
    expect(c.end).toBe(3)
    // weights 2, 4, 2 over 1.8 s
    expect(c.tokens.map((t) => +t.start.toFixed(3))).toEqual([1, 1.45, 2.35])
  })
  it('lets tapped token times win and ends the last chunk 0.6 s after its last word', () => {
    const chunks = parseScript('a b\nc d')
    const r = resolveTiming(chunks, [], [1, 1.5, 3, 4], 0, 10)
    expect(r[0].end).toBe(3)
    expect(r[1].end).toBeCloseTo(4.6)
  })
  it('auto-spreads an untimed script across the trimmed range', () => {
    const r = resolveTiming(parseScript('one\ntwo\nthree'), [], [], 0, 10)
    expect(r[0].start).toBeCloseTo(0.2)
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeGreaterThan(r[i - 1].start)
    expect(r[2].end).toBeLessThanOrEqual(10)
  })
})
