import { app } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { FFMPEG, FFPROBE, run } from './ffmpeg'
import { proposeOutPoint } from '@core/deadTail'
import { parseRate } from '@core/time'
import type { DeadTail, VideoInfo } from '@core/types'

export async function probe(path: string): Promise<VideoInfo> {
  const r = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
  if (r.code !== 0) throw new Error(`Cannot read video: ${r.stderr.trim() || 'ffprobe failed'}`)
  const j = JSON.parse(r.stdout)
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === 'video')
  if (!v) throw new Error('File has no video stream')
  // Phones store portrait video as landscape + rotation metadata.
  const rot = Math.abs(
    Number(v.tags?.rotate ?? v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0)
  )
  const swap = rot === 90 || rot === 270
  return {
    path,
    duration: Number(j.format.duration ?? v.duration ?? 0),
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    fps: parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate),
    codec: v.codec_name,
    hasAudio: j.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')
  }
}

export async function detectDeadTail(info: VideoInfo): Promise<DeadTail> {
  // Scan only the end of the file (fast on long videos). If the dead part
  // reaches back to where the scan started, it began earlier: widen the
  // window and scan again.
  let window = 30
  for (;;) {
    const from = Math.max(0, info.duration - window)
    const tail = await scanTail(info, from)
    const starts = [tail.blackStart, tail.silenceStart].filter((v): v is number => v !== null)
    const cutOff = from > 0 && starts.some((v) => v - from < 0.5)
    if (!cutOff) return tail
    window *= 3
  }
}

async function scanTail(info: VideoInfo, from: number): Promise<DeadTail> {
  const black = await run(FFMPEG, ['-hide_banner', '-nostats', '-ss', String(from), '-i', info.path,
    '-vf', 'blackdetect=d=0.3:pix_th=0.10', '-an', '-f', 'null', '-'])
  let log = shift(black.stderr, from, /(black_start:|black_end:)\s*([\d.]+)/g)
  if (info.hasAudio) {
    const sil = await run(FFMPEG, ['-hide_banner', '-nostats', '-ss', String(from), '-i', info.path,
      '-af', 'silencedetect=n=-50dB:d=0.3', '-vn', '-f', 'null', '-'])
    log += shift(sil.stderr, from, /(silence_start:|silence_end:)\s*(-?[\d.]+)/g)
  }
  return proposeOutPoint(log, info.duration, info.hasAudio)
}

/** Re-express timestamps from a seeked run in absolute file time. */
function shift(log: string, offset: number, re: RegExp): string {
  const parts: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(log))) parts.push(`${m[1]} ${(+m[2] + offset).toFixed(3)}`)
  // blackdetect prints start and end on one line; keep pairs together.
  return parts.join(' ') + '\n'
}

/**
 * Low-res H.264 copy for previewing codecs Chromium can't play (e.g. HEVC
 * without hardware support). Export always reads the original file.
 */
export async function makeProxy(info: VideoInfo, onProgress: (p: number) => void): Promise<string> {
  const dir = join(app.getPath('userData'), 'proxies')
  mkdirSync(dir, { recursive: true })
  const key = createHash('sha1').update(info.path + statSync(info.path).mtimeMs).digest('hex').slice(0, 16)
  const out = join(dir, `${key}.mp4`)
  if (existsSync(out)) {
    // A copy can be left half-written if the app was closed mid-conversion.
    if (await isPlayable(out)) return out
    rmSync(out, { force: true })
  }
  const tmp = out + '.part.mp4'
  const r = await run(FFMPEG, ['-y', '-i', info.path, '-vf', 'scale=-2:960', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmp], (s) => {
    const m = /time=(\d+):(\d+):([\d.]+)/.exec(s)
    if (m && info.duration > 0) onProgress(Math.min(1, (+m[1] * 3600 + +m[2] * 60 + +m[3]) / info.duration))
  })
  if (r.code !== 0 || !(await isPlayable(tmp))) {
    rmSync(tmp, { force: true })
    throw new Error('Could not create preview copy')
  }
  renameSync(tmp, out)
  return out
}

async function isPlayable(path: string): Promise<boolean> {
  try {
    const info = await probe(path)
    return info.duration > 0 && info.width > 0
  } catch {
    return false
  }
}
