import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

// Inside a packaged app the binaries live in app.asar.unpacked.
const unpacked = (p: string) => p.replace('app.asar', 'app.asar.unpacked')

export const FFMPEG = unpacked(ffmpegStatic as unknown as string)
export const FFPROBE = unpacked(ffprobeStatic.path)

export interface RunResult { code: number; stdout: string; stderr: string }

// Children are killed when the app quits, so no half-written files are left.
const children = new Set<ReturnType<typeof spawn>>()
export const killAll = (): void => children.forEach((c) => c.kill())

export function run(bin: string, args: string[], onStderr?: (chunk: string) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true })
    children.add(p)
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => {
      const s = d.toString()
      stderr += s
      onStderr?.(s)
    })
    p.on('error', (e) => children.delete(p) && reject(e))
    p.on('close', (code) => children.delete(p) && resolve({ code: code ?? -1, stdout, stderr }))
  })
}
