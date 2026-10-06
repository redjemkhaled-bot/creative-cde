// media://local/<encoded absolute path> serves local files to the renderer
// with HTTP Range support, which <video> needs for seeking.

import { protocol } from 'electron'
import { createReadStream, statSync } from 'fs'
import { extname } from 'path'
import { Readable } from 'stream'

export const SCHEME = 'media'

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
  ])
}

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.wav': 'audio/wav'
}

// Fonts need CORS, and canvas must stay readable (untainted) for export.
const CORS = { 'Access-Control-Allow-Origin': '*' }

export function handleMediaProtocol(): void {
  protocol.handle(SCHEME, (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname.slice(1))
    let size: number
    try {
      size = statSync(path).size
    } catch {
      return new Response('Not found', { status: 404, headers: CORS })
    }
    const type = TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '')
    if (!range) {
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream
      return new Response(body, { headers: { ...CORS, 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
    }
    const start = range[1] ? +range[1] : Math.max(0, size - +range[2])
    const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: {
        ...CORS,
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    })
  })
}
