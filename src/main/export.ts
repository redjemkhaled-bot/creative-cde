// Export pipeline (main process side).
//
//   decoder ffmpeg ──raw RGBA frames──▶ renderer drawFrame() ──RGBA──▶ encoder ffmpeg
//
// The renderer pulls source frames one at a time (export:next), draws the
// exact same frame the preview shows, and pushes the result (export:write).
// Audio: source audio trimmed to in/out, padded for the end-card hold, mixed
// with the generated SFX track (amix normalize=0).

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { encodeWav, renderSfx, SFX_RATE, type CustomSounds } from '@core/sfx'
import { frameCount, OUT_FPS, OUT_H, OUT_W, reelEnd, type Project } from '@core/types'
import { FFMPEG } from './ffmpeg'

export type ExportKind = 'mp4' | 'overlay'

const FRAME_BYTES = OUT_W * OUT_H * 4

/** Buffers ffmpeg stdout and hands out whole frames, with backpressure. */
class FrameReader {
  private chunks: Buffer[] = []
  private bytes = 0
  private ended = false
  private waiter: (() => void) | null = null

  constructor(private proc: ChildProcessWithoutNullStreams) {
    proc.stdout.on('data', (d: Buffer) => {
      this.chunks.push(d)
      this.bytes += d.length
      if (this.bytes > FRAME_BYTES * 4) proc.stdout.pause()
      this.wake()
    })
    proc.stdout.on('end', () => {
      this.ended = true
      this.wake()
    })
  }

  private wake() {
    const w = this.waiter
    this.waiter = null
    w?.()
  }

  async next(): Promise<Buffer | null> {
    while (this.bytes < FRAME_BYTES) {
      if (this.ended) return null
      this.proc.stdout.resume()
      await new Promise<void>((r) => (this.waiter = r))
    }
    const frame = Buffer.allocUnsafe(FRAME_BYTES)
    let off = 0
    while (off < FRAME_BYTES) {
      const c = this.chunks[0]
      const take = Math.min(c.length, FRAME_BYTES - off)
      c.copy(frame, off, 0, take)
      off += take
      if (take === c.length) this.chunks.shift()
      else this.chunks[0] = c.subarray(take)
    }
    this.bytes -= FRAME_BYTES
    if (this.bytes < FRAME_BYTES * 2) this.proc.stdout.resume()
    return frame
  }
}

interface Job {
  kind: ExportKind
  out: string
  tmpOut: string
  tmpFiles: string[]
  dec: ChildProcessWithoutNullStreams | null
  enc: ChildProcessWithoutNullStreams
  reader: FrameReader | null
  encErr: string
  encDone: Promise<number>
}

let job: Job | null = null

/** `<dir>/<name>_vN.<ext>` with N one higher than any existing version. */
export function nextVersionPath(dir: string, name: string, ext: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '_') || 'reel'
  let max = 0
  const re = new RegExp(`^${safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_v(\\d+)\\.${ext}$`, 'i')
  if (existsSync(dir)) for (const f of readdirSync(dir)) {
    const m = re.exec(f)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return join(dir, `${safe}_v${max + 1}.${ext}`)
}

async function decodeMono(path: string): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(SFX_RATE), '-f', 'f32le', '-'], { windowsHide: true })
    const parts: Buffer[] = []
    p.stdout.on('data', (d: Buffer) => parts.push(d))
    p.on('close', (code) => {
      if (code !== 0) return resolve(null)
      const b = Buffer.concat(parts)
      resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)).slice())
    })
    p.on('error', () => resolve(null))
  })
}

export async function loadCustomSounds(p: Project): Promise<CustomSounds> {
  return {
    pop: p.sfx.popFile ? await decodeMono(p.sfx.popFile) : null,
    whoosh: p.sfx.whooshFile ? await decodeMono(p.sfx.whooshFile) : null
  }
}

/** Write the SFX track for [inPoint, reelEnd) to a temp WAV. */
async function writeSfxWav(p: Project): Promise<string | null> {
  if (!p.sfx.enabled) return null
  const mono = renderSfx(p, p.inPoint, reelEnd(p), await loadCustomSounds(p))
  const path = join(tmpdir(), `rc_sfx_${process.pid}_${Date.now()}.wav`)
  writeFileSync(path, encodeWav(mono))
  return path
}

export async function startExport(p: Project, kind: ExportKind, out: string): Promise<{ frames: number; sourceFrames: number }> {
  if (job) throw new Error('An export is already running')
  if (!p.video && kind === 'mp4') throw new Error('Open a video first')
  const frames = frameCount(p)
  const dur = frames / OUT_FPS
  const srcLen = Math.max(0, p.outPoint - p.inPoint)
  const sourceFrames = kind === 'mp4' ? Math.round(srcLen * OUT_FPS) : 0
  const sfx = await writeSfxWav(p)
  const tmpFiles = sfx ? [sfx] : []
  const ext = kind === 'mp4' ? '.mp4' : '.mov'
  const tmpOut = join(tmpdir(), `rc_out_${process.pid}_${Date.now()}${ext}`)

  let dec: ChildProcessWithoutNullStreams | null = null
  if (kind === 'mp4') {
    dec = spawn(FFMPEG, [
      '-v', 'error', '-ss', p.inPoint.toFixed(3), '-i', p.video!.path, '-t', srcLen.toFixed(3), '-an',
      '-vf', `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase:flags=lanczos:in_color_matrix=auto,crop=${OUT_W}:${OUT_H},fps=${OUT_FPS},format=rgba`,
      '-f', 'rawvideo', '-'
    ], { windowsHide: true })
    dec.stderr.on('data', () => {})
  }

  const args = ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OUT_W}x${OUT_H}`, '-r', String(OUT_FPS), '-i', '-']
  if (kind === 'mp4') {
    const srcAudio = p.video!.hasAudio
    let n = 1
    const filters: string[] = []
    const mixIn: string[] = []
    if (srcAudio) {
      args.push('-ss', p.inPoint.toFixed(3), '-t', srcLen.toFixed(3), '-i', p.video!.path)
      filters.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${dur.toFixed(3)}[a${n}]`)
      mixIn.push(`[a${n}]`)
      n++
    }
    if (sfx) {
      args.push('-i', sfx)
      filters.push(`[${n}:a]aresample=48000,apad=whole_dur=${dur.toFixed(3)}[a${n}]`)
      mixIn.push(`[a${n}]`)
      n++
    }
    if (!mixIn.length) {
      args.push('-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo')
      filters.push(`[1:a]anull[a]`)
    } else if (mixIn.length === 1) filters.push(`${mixIn[0]}anull[a]`)
    else filters.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:duration=first:normalize=0[a]`)
    args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[a]',
      // RGB -> BT.709 YUV, tagged, so players show the colours we drew.
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-t', dur.toFixed(3), '-movflags', '+faststart', tmpOut)
  } else {
    if (sfx) args.push('-i', sfx)
    args.push('-map', '0:v')
    if (sfx) args.push('-map', '1:a', '-c:a', 'pcm_s16le')
    args.push('-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16',
      '-vendor', 'apl0', '-t', dur.toFixed(3), tmpOut)
  }
  const enc = spawn(FFMPEG, args, { windowsHide: true })
  enc.stdin.on('error', () => {}) // reported via exit code
  const encDone = new Promise<number>((r) => enc.on('close', (c) => r(c ?? -1)))
  const j: Job = { kind, out, tmpOut, tmpFiles, dec, enc, reader: dec ? new FrameReader(dec) : null, encErr: '', encDone }
  enc.stderr.on('data', (d) => (j.encErr += d))
  job = j
  return { frames, sourceFrames }
}

/** Next decoded source frame, or null when the source has no more frames. */
export async function nextFrame(): Promise<Buffer | null> {
  if (!job?.reader) return null
  return job.reader.next()
}

export async function writeFrame(data: Uint8Array): Promise<void> {
  if (!job) throw new Error('No export running')
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (!job.enc.stdin.write(buf)) {
    await new Promise<void>((resolve, reject) => {
      const j = job!
      const onDrain = () => { cleanup(); resolve() }
      const onClose = () => { cleanup(); reject(new Error(lastLines(j.encErr) || 'Encoder stopped')) }
      const cleanup = () => { j.enc.stdin.off('drain', onDrain); j.enc.off('close', onClose) }
      j.enc.stdin.once('drain', onDrain)
      j.enc.once('close', onClose)
    })
  }
}

const lastLines = (s: string) => s.trim().split('\n').slice(-3).join('\n')

export async function finishExport(): Promise<string> {
  if (!job) throw new Error('No export running')
  const j = job
  j.enc.stdin.end()
  const code = await j.encDone
  j.dec?.kill()
  job = null
  cleanupFiles(j.tmpFiles)
  if (code !== 0) {
    rmSync(j.tmpOut, { force: true })
    throw new Error(`Encoding failed: ${lastLines(j.encErr)}`)
  }
  try {
    renameSync(j.tmpOut, j.out)
  } catch {
    // Different drive: copy then delete.
    const { copyFileSync } = await import('fs')
    copyFileSync(j.tmpOut, j.out)
    rmSync(j.tmpOut, { force: true })
  }
  return j.out
}

export function cancelExport(): void {
  if (!job) return
  const j = job
  job = null
  j.dec?.kill()
  j.enc.kill()
  j.encDone.then(() => rmSync(j.tmpOut, { force: true }))
  cleanupFiles(j.tmpFiles)
}

function cleanupFiles(files: string[]) {
  for (const f of files) rmSync(f, { force: true })
}

/** Mono PCM of a video's audio for the waveform (8 kHz float). */
export async function extractPcm(path: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { windowsHide: true })
    const parts: Buffer[] = []
    p.stdout.on('data', (d: Buffer) => parts.push(d))
    p.on('close', (code) => resolve(code === 0 ? Buffer.concat(parts) : null))
    p.on('error', () => resolve(null))
  })
}
