import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Clock, AlertTriangle, CheckCircle2, Play } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('vg_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface Asset {
  id: string
  url: string
  title: string
  addedAt: string
  monitoringFrequency: string | null
  lastChecked: string | null
  status: 'active' | 'checking' | 'idle'
  lastScanJobId: string | null
}

interface AssetScanResult {
  riskSummary: { high: number; medium: number; low: number }
  detectionCount: number
  jobId: string
}

interface AssetsSectionProps {
  assets: Asset[]
  onAddAsset: (asset: Asset) => void
  onRemoveAsset: (id: string) => void
  onUpdateAsset: (asset: Asset) => void
  onSetAssets: (assets: Asset[]) => void
}

export function AssetsSection({ assets, onAddAsset, onRemoveAsset, onUpdateAsset, onSetAssets }: AssetsSectionProps) {
  const [newUrl, setNewUrl] = useState('')
  const [showNotification, setShowNotification] = useState<{ type: string; message: string } | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [isLoadingTitle, setIsLoadingTitle] = useState(false)
  const [scanResults, setScanResults] = useState<Record<string, AssetScanResult>>({})

  const notify = (type: string, message: string, ms = 2500) => {
    setShowNotification({ type, message })
    setTimeout(() => setShowNotification(null), ms)
  }

  const fetchAssetScanResults = async (assetId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/assets/${assetId}/results`, {
        headers: { ...getAuthHeader() },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.status === 'completed') {
        setScanResults(prev => ({ ...prev, [assetId]: data as AssetScanResult }))
      }
    } catch {
      // silently ignore — results are optional display
    }
  }

  const refreshAssets = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/assets`, {
        headers: { ...getAuthHeader() },
      })
      if (!response.ok) throw new Error('Failed to fetch assets')
      const data = await response.json()
      const fetched: Asset[] = data.assets || []
      onSetAssets(fetched)
      // Pre-fetch scan results for any asset that has a lastScanJobId
      fetched.forEach(a => { if (a.lastScanJobId) fetchAssetScanResults(a.id) })
    } catch (error) {
      console.error('Error fetching assets:', error)
      notify('warning', 'Could not load assets. Please try again.')
    }
  }

  useEffect(() => {
    refreshAssets()
  }, [])

  const handleAddAsset = async () => {
    if (!newUrl.trim()) {
      notify('warning', 'Please enter a video URL')
      return
    }
    setIsLoadingTitle(true)
    try {
      const response = await fetch(`${API_BASE}/api/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ url: newUrl }),
      })
      if (!response.ok) throw new Error('Failed to register asset')
      const asset: Asset = await response.json()
      onAddAsset(asset)
      setNewUrl('')
      notify('success', `Added "${asset.title}" to monitoring`)
    } catch (error) {
      console.error('Error registering asset:', error)
      notify('warning', 'Could not register asset. Please check the URL.')
    } finally {
      setIsLoadingTitle(false)
    }
  }

  const handleSetMonitoring = async (assetId: string, frequency: string | null) => {
    try {
      const response = await fetch(`${API_BASE}/api/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          monitoringFrequency: frequency,
          status: frequency ? 'active' : 'idle',
        }),
      })
      if (!response.ok) throw new Error('Failed to update monitoring')
      const updatedAsset: Asset = await response.json()
      onUpdateAsset(updatedAsset)
      // Sync selectedAsset panel
      setSelectedAsset(prev => prev?.id === assetId ? updatedAsset : prev)
      notify('info', frequency ? `Monitoring set to every ${frequency}` : 'Monitoring disabled')
    } catch (error) {
      console.error('Error updating asset monitoring:', error)
      notify('warning', 'Could not update monitoring settings.')
    }
  }

  const handleCheckNow = async (assetId: string) => {
    try {
      // Trigger real scan
      const res = await fetch(`${API_BASE}/api/assets/${assetId}/scan`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
      })
      if (!res.ok) throw new Error('Failed to start scan')
      const { job_id } = await res.json()

      // Optimistically mark as checking
      const asset = assets.find(a => a.id === assetId)
      if (asset) onUpdateAsset({ ...asset, status: 'checking' })

      // Poll job status
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/api/analyze/${job_id}`, {
            headers: { ...getAuthHeader() },
          })
          if (!statusRes.ok) { clearInterval(poll); return }
          const statusData = await statusRes.json()

          if (statusData.status === 'completed' || statusData.status === 'failed') {
            clearInterval(poll)
            // Re-fetch the asset to get updated lastChecked/lastScanJobId
            const assetRes = await fetch(`${API_BASE}/api/assets/${assetId}`, {
              headers: { ...getAuthHeader() },
            })
            if (assetRes.ok) {
              const updated: Asset = await assetRes.json()
              onUpdateAsset(updated)
              setSelectedAsset(prev => prev?.id === assetId ? updated : prev)
            }
            // Fetch scan results for risk summary
            await fetchAssetScanResults(assetId)
            notify(
              statusData.status === 'completed' ? 'success' : 'warning',
              statusData.status === 'completed' ? 'Scan completed' : 'Scan failed'
            )
          }
        } catch {
          clearInterval(poll)
        }
      }, 2500)
    } catch (error) {
      console.error('Error starting check:', error)
      notify('warning', 'Could not start scan.')
    }
  }

  const getTimeUntilNextCheck = (asset: Asset) => {
    if (!asset.monitoringFrequency || !asset.lastChecked) return 'Never'
    const lastCheck = new Date(asset.lastChecked)
    const frequency = parseInt(asset.monitoringFrequency)
    const nextCheck = new Date(lastCheck.getTime() + frequency * 3600000)
    const diff = nextCheck.getTime() - Date.now()
    if (diff <= 0) return 'Due now'
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  return (
    <section className="h-full flex flex-col gap-5">
      {/* Notification Toast */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-4 right-4 px-4 py-3 rounded-xl text-sm font-semibold z-50"
            style={{
              backgroundColor:
                showNotification.type === 'success'
                  ? 'rgba(16,185,129,0.2)'
                  : showNotification.type === 'warning'
                    ? 'rgba(245,158,11,0.2)'
                    : 'rgba(99,102,241,0.2)',
              border:
                showNotification.type === 'success'
                  ? '1px solid rgba(16,185,129,0.4)'
                  : showNotification.type === 'warning'
                    ? '1px solid rgba(245,158,11,0.4)'
                    : '1px solid rgba(99,102,241,0.4)',
              color:
                showNotification.type === 'success'
                  ? '#10B981'
                  : showNotification.type === 'warning'
                    ? '#F59E0B'
                    : '#818CF8',
            }}
          >
            {showNotification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section Label */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-5 rounded-full" style={{ backgroundColor: '#6366F1', boxShadow: '0 0 12px #6366F1' }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#A1A1AA' }}>
          Monitored Assets
        </h2>
        <span className="ml-auto text-xs text-[#52525B]">{assets.length} videos</span>
      </div>

      <div className="grid grid-cols-3 gap-5 flex-1">
        {/* Add Asset Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{
            background: 'linear-gradient(145deg, #1a1a1f, #16161a)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#52525B' }}>
            Add New Asset
          </p>

          <div className="space-y-3 flex-1">
            <div>
              <label className="text-[10px] font-semibold text-[#A1A1AA] block mb-2">YouTube URL</label>
              <input
                type="text"
                placeholder="https://youtube.com/watch?v=..."
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddAsset() }}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[#E4E4E7] placeholder-[#52525B] focus:outline-none focus:border-[#6366F1]/50 transition-colors"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAddAsset}
            disabled={isLoadingTitle}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#818CF8' }}
          >
            {isLoadingTitle ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
                  <Clock className="w-4 h-4" />
                </motion.div>
                Fetching...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Asset
              </>
            )}
          </motion.button>
        </motion.div>

        {/* Assets List */}
        <div className="col-span-2 rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'linear-gradient(145deg, #1a1a1f, #16161a)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#52525B' }}>
              Monitored Videos
            </p>
            <span className="text-xs text-[#6366F1] font-semibold">{assets.filter(a => a.monitoringFrequency).length} Active</span>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            <AnimatePresence>
              {assets.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center h-32 text-center"
                >
                  <p style={{ color: '#52525B' }} className="text-sm">No assets added yet</p>
                </motion.div>
              ) : (
                assets.map((asset, idx) => {
                  const result = scanResults[asset.id]
                  return (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => setSelectedAsset(prev => prev?.id === asset.id ? null : asset)}
                      className="p-3 rounded-lg cursor-pointer transition-all"
                      style={{
                        backgroundColor: selectedAsset?.id === asset.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                        border: selectedAsset?.id === asset.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#E4E4E7] truncate">{asset.title}</p>
                          <p className="text-[10px] text-[#71717A] truncate mt-1">{asset.url}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {asset.monitoringFrequency ? (
                              <>
                                <Clock className="w-3 h-3" style={{ color: '#6366F1' }} />
                                <span className="text-[10px] font-mono text-[#6366F1]">Every {asset.monitoringFrequency}</span>
                                {asset.lastChecked && (
                                  <span className="text-[10px] text-[#52525B]">Next: {getTimeUntilNextCheck(asset)}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-[#52525B]">Monitoring disabled</span>
                            )}
                          </div>
                          {/* Scan results summary */}
                          {result && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] font-semibold" style={{ color: '#EF4444' }}>
                                {result.riskSummary.high}H
                              </span>
                              <span className="text-[10px] font-semibold" style={{ color: '#F59E0B' }}>
                                {result.riskSummary.medium}M
                              </span>
                              <span className="text-[10px] font-semibold" style={{ color: '#10B981' }}>
                                {result.riskSummary.low}L
                              </span>
                              <span className="text-[10px] text-[#52525B]">
                                {result.detectionCount} detection{result.detectionCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {asset.status === 'checking' && (
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
                              <Clock className="w-4 h-4" style={{ color: '#F59E0B' }} />
                            </motion.div>
                          )}
                          {asset.lastChecked && asset.status !== 'checking' && (
                            <CheckCircle2 className="w-4 h-4" style={{ color: '#10B981' }} />
                          )}
                          {!asset.lastChecked && asset.status !== 'checking' && (
                            <AlertTriangle className="w-4 h-4" style={{ color: '#52525B' }} />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Asset Details Panel */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl p-5"
            style={{ background: 'linear-gradient(145deg, #1a1a1f, #16161a)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#52525B] mb-3">Monitoring Settings</p>
                <div className="space-y-2">
                  {['1h', '2h', '6h', '24h'].map(freq => (
                    <motion.button
                      key={freq}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSetMonitoring(selectedAsset.id, selectedAsset.monitoringFrequency === freq ? null : freq)}
                      className="w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-left"
                      style={{
                        backgroundColor: selectedAsset.monitoringFrequency === freq ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                        border: selectedAsset.monitoringFrequency === freq ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.1)',
                        color: selectedAsset.monitoringFrequency === freq ? '#818CF8' : '#A1A1AA',
                      }}
                    >
                      Check every {freq}
                      {selectedAsset.monitoringFrequency === freq && ' ✓'}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#52525B] mb-3">Actions</p>
                <div className="space-y-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCheckNow(selectedAsset.id)}
                    disabled={selectedAsset.status === 'checking'}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981' }}
                  >
                    {selectedAsset.status === 'checking' ? (
                      <>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
                          <Clock className="w-4 h-4" />
                        </motion.div>
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Check Now
                      </>
                    )}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      fetch(`${API_BASE}/api/assets/${selectedAsset.id}`, {
                        method: 'DELETE',
                        headers: { ...getAuthHeader() },
                      })
                        .then(res => (res.ok ? res.json() : Promise.reject()))
                        .then(() => {
                          onRemoveAsset(selectedAsset.id)
                          setSelectedAsset(null)
                          notify('success', 'Asset removed')
                        })
                        .catch(() => notify('warning', 'Could not remove asset.'))
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors"
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444' }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove Asset
                  </motion.button>
                </div>
              </div>
            </div>

            {selectedAsset.lastChecked && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-[10px] text-[#52525B]">
                  Last checked: {new Date(selectedAsset.lastChecked).toLocaleString()}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
