"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVideoInfo = getVideoInfo;
exports.extractVideo = extractVideo;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// ── Binary resolution ─────────────────────────────────────────
function getBinaryPath(name) {
    // In development: use system PATH
    if (!electron_1.app.isPackaged)
        return name;
    // In production: use bundled binaries
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path_1.default.join(process.resourcesPath, 'bin', `${name}${ext}`);
}
const YT_DLP = getBinaryPath('yt-dlp');
const FFMPEG = getBinaryPath('ffmpeg');
async function getVideoInfo(url) {
    const { stdout } = await execFileAsync(YT_DLP, [
        '--dump-json',
        '--no-playlist',
        '--skip-download',
        '--no-warnings',
        '--format', 'worst[ext=mp4]',
        url,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
    const info = JSON.parse(stdout);
    // Resolve the direct stream URL
    let streamUrl = info.url || '';
    if (!streamUrl && info.requested_formats?.length) {
        streamUrl = info.requested_formats[0].url || '';
    }
    return {
        title: info.title || 'Unknown',
        id: info.id || '',
        duration: info.duration || 0,
        streamUrl,
        url,
        thumbnail: info.thumbnail || '',
        uploader: info.uploader || 'Unknown Channel',
    };
}
// ── Frame timestamp calculation ───────────────────────────────
function calculateTimestamps(duration, nFrames) {
    if (nFrames <= 0)
        return [];
    const effectiveStart = duration * 0.05;
    let effectiveEnd = duration * 0.95;
    if (effectiveEnd <= effectiveStart) {
        return [duration / 2]; // fallback for very short videos
    }
    const effectiveLength = effectiveEnd - effectiveStart;
    const offset = effectiveLength / (nFrames + 1);
    return Array.from({ length: nFrames }, (_, i) => Math.round((effectiveStart + offset * (i + 1)) * 100) / 100);
}
// ── Single frame grab ─────────────────────────────────────────
async function grabFrame(streamUrl, timestamp) {
    const { stdout } = await execFileAsync(FFMPEG, [
        '-ss', String(timestamp), // Seek BEFORE input (fast input seeking)
        '-i', streamUrl, // Stream URL (no download)
        '-frames:v', '1', // Grab exactly 1 frame
        '-f', 'image2pipe', // Pipe output
        '-vcodec', 'png', // PNG format
        '-loglevel', 'error',
        'pipe:1',
    ], {
        timeout: 30000,
        encoding: 'buffer', // Return raw Buffer, not string
        maxBuffer: 10 * 1024 * 1024, // 10MB max per frame
    });
    // @ts-ignore - stdout is Buffer when encoding is 'buffer'
    return stdout;
}
async function extractVideo(url, nFrames) {
    // Step 1: Get metadata + stream URL via yt-dlp
    const metadata = await getVideoInfo(url);
    if (nFrames <= 0 || !metadata.streamUrl) {
        return { metadata, frames: [] };
    }
    // Step 2: Calculate timestamps
    const timestamps = calculateTimestamps(metadata.duration, nFrames);
    // Step 3: Extract each frame via FFmpeg
    const frames = [];
    for (const ts of timestamps) {
        try {
            const buffer = await grabFrame(metadata.streamUrl, ts);
            frames.push(buffer.toString('base64'));
        }
        catch (err) {
            console.error(`Failed to grab frame at ${ts}s:`, err);
            // Skip failed frames, don't abort
        }
    }
    return { metadata, frames };
}
