import { useState, useRef } from 'react'
import { Upload, FileVideo, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { RiskBadge } from './RiskBadge'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

interface PrecheckDetection {
  id: string
  title: string
  channel: string
  thumbnailUrl: string
  similarity: number
  risk: 'high' | 'medium' | 'low'
  platform: string
  url: string
}

interface PrecheckResult {
  status: string
  safe_to_upload: boolean
  searchTitle: string
  riskSummary: { high: number; medium: number; low: number }
  detections: PrecheckDetection[]
}

export function UploadBox() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [titleOverride, setTitleOverride] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [checkResults, setCheckResults] = useState<PrecheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFile = (file: File) => {
    setUploadedFile(file)
    setIsDone(false)
    setCheckResults(null)
    setCheckError(null)
  }

  const handleCheck = async () => {
    if (!uploadedFile) return
    setIsChecking(true)
    setCheckError(null)
    setCheckResults(null)

    const formData = new FormData()
    formData.append('file', uploadedFile)
    if (titleOverride.trim()) {
      formData.append('title', titleOverride.trim())
    }

    try {
      const token = localStorage.getItem('vg_token')
      // Do NOT set Content-Type — browser sets multipart/form-data boundary automatically
      const res = await fetch(`${API_BASE}/api/precheck`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail ?? `Server error ${res.status}`)
      }
      const data: PrecheckResult = await res.json()
      setCheckResults(data)
      setIsDone(true)
    } catch (err: any) {
      setCheckError(err.message)
    } finally {
      setIsChecking(false)
    }
  }

  const handleClear = () => {
    setUploadedFile(null)
    setTitleOverride('')
    setIsDone(false)
    setIsChecking(false)
    setCheckResults(null)
    setCheckError(null)
  }

  const isSafe = isDone && checkResults?.safe_to_upload
  const hasConflicts = isDone && checkResults && !checkResults.safe_to_upload

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        id="upload-drop-zone"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploadedFile && inputRef.current?.click()}
        className="relative rounded-xl transition-all duration-200 cursor-pointer"
        style={{
          border: isDragging
            ? '2px dashed #6366F1'
            : uploadedFile
              ? '2px solid rgba(16,185,129,0.4)'
              : '2px dashed rgba(255,255,255,0.1)',
          backgroundColor: isDragging
            ? 'rgba(99,102,241,0.06)'
            : uploadedFile
              ? 'rgba(16,185,129,0.04)'
              : 'rgba(255,255,255,0.02)',
          boxShadow: isDragging ? '0 0 24px rgba(99,102,241,0.15)' : 'none',
          padding: '32px 24px',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          id="file-upload-input"
          accept=".mp4,.mov,.avi,.mkv,.webm"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {uploadedFile ? (
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}
            >
              <FileVideo className="w-6 h-6" style={{ color: '#10B981' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#E4E4E7' }}>
                {uploadedFile.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#71717A' }}>
                {(uploadedFile.size / 1_000_000).toFixed(1)} MB • Ready to scan
              </p>
            </div>
            <button
              id="clear-upload-btn"
              onClick={(e) => { e.stopPropagation(); handleClear() }}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              aria-label="Remove file"
            >
              <X className="w-4 h-4" style={{ color: '#71717A' }} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: isDragging ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                transition: 'all 0.2s',
              }}
            >
              <Upload
                className="w-7 h-7 transition-transform duration-200"
                style={{
                  color: isDragging ? '#6366F1' : '#52525B',
                  transform: isDragging ? 'translateY(-2px)' : 'none',
                }}
              />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: '#E4E4E7' }}>
                {isDragging ? 'Drop to upload' : 'Drag & drop your video here'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#52525B' }}>
                or click to browse • MP4, MOV, AVI, MKV, WebM
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Optional title override */}
      {uploadedFile && !isDone && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#52525B' }}>
            Search Title (optional)
          </label>
          <input
            type="text"
            placeholder="Custom title for YouTube search — defaults to filename"
            value={titleOverride}
            onChange={(e) => setTitleOverride(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#E4E4E7',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* Error display */}
      {checkError && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#F87171',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {checkError}
        </div>
      )}

      {/* Action button */}
      {uploadedFile && (
        <button
          id="check-before-upload-btn"
          onClick={handleCheck}
          disabled={isChecking || isDone}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            backgroundColor: isSafe
              ? 'rgba(16,185,129,0.12)'
              : hasConflicts
                ? 'rgba(239,68,68,0.12)'
                : isChecking
                  ? 'rgba(99,102,241,0.15)'
                  : '#6366F1',
            color: isSafe
              ? '#10B981'
              : hasConflicts
                ? '#F87171'
                : isChecking
                  ? '#818CF8'
                  : 'white',
            border: isDone
              ? `1px solid ${isSafe ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
              : 'none',
            cursor: isChecking || isDone ? 'default' : 'pointer',
            boxShadow: !isDone && !isChecking ? '0 0 20px rgba(99,102,241,0.3)' : 'none',
          }}
        >
          {isSafe ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Safe to Upload — No conflicts found
            </>
          ) : hasConflicts ? (
            <>
              <AlertTriangle className="w-4 h-4" />
              Conflicts Found — {checkResults!.riskSummary.high}H&nbsp;
              {checkResults!.riskSummary.medium}M&nbsp;
              {checkResults!.riskSummary.low}L
            </>
          ) : isChecking ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Scanning for conflicts…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Run Pre-upload Check
            </>
          )}
        </button>
      )}

      {/* Detection results list */}
      {isDone && checkResults && checkResults.detections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#52525B' }}>
              {checkResults.detections.length} Potential Conflict{checkResults.detections.length !== 1 ? 's' : ''} Detected
            </p>
            {checkResults.searchTitle && (
              <p className="text-[10px]" style={{ color: '#52525B' }}>
                Searched: "{checkResults.searchTitle}"
              </p>
            )}
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {checkResults.detections.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: '#E4E4E7' }}>{d.title}</p>
                  <p className="text-[10px] truncate mt-0.5" style={{ color: '#71717A' }}>
                    {d.channel} · {(d.similarity * 100).toFixed(0)}% similar
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RiskBadge risk={d.risk} />
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] px-2 py-0.5 rounded transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: 'rgba(99,102,241,0.15)',
                        color: '#818CF8',
                        border: '1px solid rgba(99,102,241,0.2)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No conflicts message */}
      {isDone && checkResults && checkResults.detections.length === 0 && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            color: '#10B981',
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          No similar videos found on YouTube. Safe to upload.
        </div>
      )}
    </div>
  )
}
