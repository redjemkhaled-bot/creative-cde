// The approved v1 reel (Younes, Redjem Studio).

import type { EndCardSettings, Project, ReelEvent, Side } from './types'

export const V1_SCRIPT = `سلعة من طرف لطرف
حاب تبان في *la foire* تاعك
تبان *qualité* مليحة
*les sacs* *les dépliants*
*les cartes visite* *les stylos*
وعفايس بزاف وحد أخرين
عندك حتى *les agendas*
وعندك *conception* ولا ما عندكش؟
ما تحيرش روحك
*l'équipe infographie* تاعنا راهم في الخدمة
يخدمولك *la conception*
ما شاء الله
تبريزونتي فيها المنتجات تاعك
ولا الخدمات تاعك *بأحسن* *صورة*
مرحبا بكم خاوتي
عند *Redjem Studio*
*meilleure qualité*
*meilleur prix*`

export const V1_CHUNK_TIMES: [number, number][] = [
  [0.4, 2.05], [2.15, 3.45], [3.5, 4.54], [4.87, 6.1], [6.31, 8.14], [8.3, 9.4],
  [9.56, 10.85], [11.05, 12.23], [12.36, 13.2], [13.29, 14.56], [14.7, 15.2], [15.43, 16.34],
  [16.63, 18.13], [18.22, 19.61], [19.96, 20.8], [20.87, 22.15], [22.25, 23.15], [23.2, 24.1]
]

export const V1_IN = 0
export const V1_OUT = 25.2

// --- events: exact values from reference/render.py -------------------------


const prod = (n: number) => `products-${n}.png`

/** (product, width, t_in, t_out, x, y, side, base_rot) — render.py PRODS */
const PRODS: [number, number, number, number, number, number, Side, number][] = [
  [11, 380, 0.25, 1.8, 200, 1010, -1, -8],
  [13, 300, 0.4, 1.8, 880, 960, 1, 6],
  [13, 320, 4.87, 6.2, 880, 990, 1, 5],
  [14, 340, 6.31, 7.45, 200, 1000, -1, -6],
  [15, 380, 7.36, 8.4, 870, 1000, 1, 4],
  [16, 360, 8.3, 9.5, 210, 980, -1, -5],
  [17, 360, 8.45, 9.5, 870, 1060, 1, 5],
  [11, 420, 9.56, 10.95, 215, 1010, -1, -7],
  [12, 400, 9.7, 10.95, 865, 990, 1, 7]
]

export const V1_END_CARD_START = 24.1

export function v1Events(services: string[]): ReelEvent[] {
  let n = 0
  const id = () => `v1_${n++}`
  const ev: ReelEvent[] = PRODS.map(([p, width, start, end, x, y, side, rotation]) => ({
    id: id(), type: 'product', product: prod(p), width, start, end, x, y, side, rotation
  }))
  // PUNCHES (t0, duration, amount) and HOLD
  for (const [start, d, amount] of [[4.5, 0.45, 1.07], [11.0, 0.4, 1.05], [20.85, 0.4, 1.05]])
    ev.push({ id: id(), type: 'zoomPunch', start, end: start + d, amount, centerY: 820 })
  ev.push({ id: id(), type: 'zoomHold', start: 9.5, end: 10.95, amount: 1.1, centerY: 820, ramp: 0.25 })
  // CARD_T, CARD_POS
  ev.push({ id: id(), type: 'card', start: 13.25, end: 15.3, x: 540, y: 880, products: [prod(11), prod(14), prod(16)], label: 'CONCEPTION' })
  // PILLS, PILL_OUT
  const pills: [number, number, number][] = [[16.7, 330, 860], [17.25, 760, 860], [18.1, 330, 975], [18.65, 750, 975]]
  pills.forEach(([start, x, y], i) => {
    if (services[i]) ev.push({ id: id(), type: 'pill', start, end: 19.62, x, y, text: services[i] })
  })
  // SPARKS ranges (7 sparkles each)
  for (const [start, end] of [[15.45, 16.3], [18.95, 19.6], [22.25, 24.05]])
    ev.push({ id: id(), type: 'sparkles', start, end, seed: 7 + n, count: 7 })
  // LOGO_T = (20.87, END_CARD - 0.1), at (520, 390), logo 250 px wide
  ev.push({ id: id(), type: 'logoCard', start: 20.87, end: V1_END_CARD_START - 0.1, x: 520, y: 390, width: 250 })
  return ev
}

/** EC_PRODS (product, width, x, y, side, rot, delay) */
export function v1EndCard(): EndCardSettings {
  const ec: [number, number, number, number, Side, number, number][] = [
    [15, 300, 190, 1660, -1, -10, 0.55], [13, 230, 900, 1640, 1, 8, 0.7],
    [16, 300, 880, 330, 1, 8, 0.85], [11, 260, 170, 360, -1, -8, 1.0]
  ]
  return {
    enabled: true,
    start: V1_END_CARD_START,
    hold: 2.1,
    products: ec.map(([p, width, x, y, side, rotation, delay]) => ({ product: prod(p), width, x, y, side, rotation, delay }))
  }
}

/** Apply the whole approved v1 reel (script, timings, events, end card). */
export function applyV1(p: Project, services: string[]): Project {
  return {
    ...p,
    inPoint: V1_IN,
    outPoint: p.video ? Math.min(V1_OUT, p.video.duration) : V1_OUT,
    script: V1_SCRIPT,
    chunkTimes: V1_CHUNK_TIMES.map(([start, end]) => ({ start, end })),
    tokenTimes: [],
    events: v1Events(services),
    endCard: v1EndCard(),
    captions: { preset: 'pop', centerY: null },
    watermark: { enabled: true, y: 330, opacity: 0.9 }
  }
}
