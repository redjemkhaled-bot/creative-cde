// Plays the generated SFX track in sync with the preview video.

import { renderSfx, SFX_RATE, type CustomSounds } from '@core/sfx'
import { reelEnd, type Project } from '@core/types'
import { mediaUrl } from './media'

let ctx: AudioContext | null = null
let node: AudioBufferSourceNode | null = null
let cacheKey = ''
let cached: AudioBuffer | null = null
const customCache = new Map<string, Float32Array | null>()

async function decodeCustom(path: string | null): Promise<Float32Array | null> {
  if (!path) return null
  if (customCache.has(path)) return customCache.get(path)!
  try {
    const buf = await (await fetch(mediaUrl(path))).arrayBuffer()
    const off = new OfflineAudioContext(1, 1, SFX_RATE)
    const a = await off.decodeAudioData(buf)
    customCache.set(path, a.getChannelData(0))
  } catch {
    customCache.set(path, null)
  }
  return customCache.get(path)!
}

async function buffer(p: Project): Promise<AudioBuffer> {
  const key = JSON.stringify([p.events, p.endCard, p.sfx, p.inPoint, p.outPoint])
  if (key === cacheKey && cached) return cached
  const custom: CustomSounds = { pop: await decodeCustom(p.sfx.popFile), whoosh: await decodeCustom(p.sfx.whooshFile) }
  const mono = renderSfx(p, 0, reelEnd(p) + 1, custom)
  ctx ??= new AudioContext({ sampleRate: SFX_RATE })
  const b = ctx.createBuffer(1, mono.length, SFX_RATE)
  b.copyToChannel(mono as Float32Array<ArrayBuffer>, 0)
  cacheKey = key
  cached = b
  return b
}

export async function startSfx(p: Project, t: number, rate: number): Promise<void> {
  stopSfx()
  if (!p.sfx.enabled) return
  const b = await buffer(p)
  ctx ??= new AudioContext({ sampleRate: SFX_RATE })
  if (ctx.state === 'suspended') await ctx.resume()
  node = ctx.createBufferSource()
  node.buffer = b
  node.playbackRate.value = rate
  node.connect(ctx.destination)
  node.start(0, Math.max(0, t))
}

export function stopSfx(): void {
  try {
    node?.stop()
  } catch {
    /* already stopped */
  }
  node?.disconnect()
  node = null
}
