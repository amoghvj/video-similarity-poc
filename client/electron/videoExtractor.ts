import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

// ── Binary resolution ─────────────────────────────────────────
function getBinaryPath(name: string): string {
  // In development: use system PATH
  if (!app.isPackaged) return name

  // In production: use bundled binaries
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(process.resourcesPath, 'bin', `${name}${ext}`)
}

const YT_DLP = getBinaryPath('yt-dlp')
const FFMPEG = getBinaryPath('ffmpeg')

// ── Metadata extraction ───────────────────────────────────────
export interface VideoMetadata {
  title: string
  id: string
  duration: number
  streamUrl: string
  url: string
  thumbnail: string
  uploader: string
}

export async function getVideoInfo(url: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync(YT_DLP, [
    '--dump-json',
    '--no-playlist',
    '--skip-download',
    '--no-warnings',
    '--format', 'worst[ext=mp4]',
    url,
  ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 })

  const info = JSON.parse(stdout)

  // Resolve the direct stream URL
  let streamUrl = info.url || ''
  if (!streamUrl && info.requested_formats?.length) {
    streamUrl = info.requested_formats[0].url || ''
  }

  return {
    title: info.title || 'Unknown',
    id: info.id || '',
    duration: info.duration || 0,
    streamUrl,
    url,
    thumbnail: info.thumbnail || '',
    uploader: info.uploader || 'Unknown Channel',
  }
}

// ── Frame timestamp calculation ───────────────────────────────
function calculateTimestamps(duration: number, nFrames: number): number[] {
  if (nFrames <= 0) return []

  const effectiveStart = duration * 0.05
  let effectiveEnd = duration * 0.95
  if (effectiveEnd <= effectiveStart) {
    return [duration / 2] // fallback for very short videos
  }

  const effectiveLength = effectiveEnd - effectiveStart
  const offset = effectiveLength / (nFrames + 1)

  return Array.from({ length: nFrames }, (_, i) =>
    Math.round((effectiveStart + offset * (i + 1)) * 100) / 100
  )
}

// ── Single frame grab from LOCAL file ─────────────────────────
async function grabFrameFromFile(filePath: string, timestamp: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(FFMPEG, [
    '-ss', String(timestamp),    // Seek BEFORE input (fast input seeking)
    '-i', filePath,              // Local file path (not a URL)
    '-frames:v', '1',            // Grab exactly 1 frame
    '-f', 'image2pipe',          // Pipe output
    '-vcodec', 'png',            // PNG format
    '-loglevel', 'error',
    'pipe:1',
  ], {
    timeout: 30000,
    encoding: 'buffer',          // Return raw Buffer, not string
    maxBuffer: 10 * 1024 * 1024, // 10MB max per frame
  })

  // @ts-ignore - stdout is Buffer when encoding is 'buffer'
  return stdout
}

// ── Full extraction pipeline ──────────────────────────────────
export interface ExtractionResult {
  metadata: VideoMetadata
  frames: string[] // base64 PNG strings
}

export async function extractVideo(
  url: string,
  nFrames: number
): Promise<ExtractionResult> {
  // Step 1: Get metadata via yt-dlp
  const metadata = await getVideoInfo(url)

  if (nFrames <= 0) {
    return { metadata, frames: [] }
  }

  // Step 2: Download the video to a temp file using yt-dlp
  // yt-dlp handles YouTube authentication, cookies, and rate limiting properly
  const tmpDir = app.getPath('temp')
  const tmpFile = path.join(tmpDir, `framelock_${Date.now()}.mp4`)

  try {
    await execFileAsync(YT_DLP, [
      '--no-playlist',
      '--no-warnings',
      '--format', 'worst[ext=mp4]/worst',
      '-o', tmpFile,
      url,
    ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 })

    // Step 3: Calculate timestamps
    const timestamps = calculateTimestamps(metadata.duration, nFrames)

    // Step 4: Extract each frame from the local file via FFmpeg
    const frames: string[] = []
    for (const ts of timestamps) {
      try {
        const buffer = await grabFrameFromFile(tmpFile, ts)
        frames.push(buffer.toString('base64'))
      } catch (err) {
        console.error(`Failed to grab frame at ${ts}s:`, err)
        // Skip failed frames, don't abort
      }
    }

    return { metadata, frames }
  } finally {
    // Clean up temp file
    try {
      const fs = await import('fs')
      fs.unlinkSync(tmpFile)
    } catch { /* ignore cleanup errors */ }
  }
}
