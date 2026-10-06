import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { normalizeProject, type Project } from '@core/types'

export const PROJECT_EXT = 'reel.json'
const autosavePath = () => join(app.getPath('userData'), 'autosave.project.json')

/** Project as stored on disk (the preview proxy path is machine-specific). */
const toDisk = (p: Project) => JSON.stringify({ ...p, previewPath: null }, null, 2)

export function saveProject(path: string, p: Project): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, toDisk(p))
}

/** Load a project; a relative video path is resolved next to the project file. */
export function loadProject(path: string): Project {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const p = normalizeProject(raw)
  if (p.video && !isAbsolute(p.video.path)) p.video = { ...p.video, path: resolve(dirname(path), p.video.path) }
  return p
}

export function autosave(p: Project, projectPath: string | null): void {
  writeFileSync(autosavePath(), JSON.stringify({ projectPath, project: JSON.parse(toDisk(p)) }))
}

export function loadAutosave(): { projectPath: string | null; project: Project } | null {
  const f = autosavePath()
  if (!existsSync(f)) return null
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    return { projectPath: j.projectPath ?? null, project: normalizeProject(j.project) }
  } catch {
    return null
  }
}
