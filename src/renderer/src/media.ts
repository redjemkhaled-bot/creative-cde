/** URL the renderer can load for a local file (served by the main process). */
export const mediaUrl = (path: string): string => `media://local/${encodeURIComponent(path)}`
