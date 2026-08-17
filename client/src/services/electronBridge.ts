/**
 * Detects whether the app is running inside Electron.
 * Falls back gracefully to server-side processing if not.
 */
export function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron
}

export interface ExtractedVideo {
  metadata: {
    title: string
    id: string
    duration: number
    streamUrl: string
    url: string
    thumbnail: string
    uploader: string
  }
  frames: string[] // base64 encoded PNGs
}

/**
 * Extract video metadata and frames.
 * - In Electron: runs yt-dlp + FFmpeg locally via IPC
 * - In browser: throws (caller should fall back to server-side URL-only mode)
 */
export async function extractVideoLocally(
  url: string,
  nFrames: number
): Promise<ExtractedVideo> {
  if (!isElectron()) {
    throw new Error('Local extraction not available — not running in Electron')
  }
  return window.electronAPI!.extractVideo(url, nFrames)
}
