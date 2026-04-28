import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bot, Download, AlertCircle, TrendingUp, CheckCircle2 } from 'lucide-react'

interface ReportModalProps {
  isOpen: boolean
  report: any
  onClose: () => void
  onExport?: () => void
}

export function ReportModal({ isOpen, report, onClose, onExport }: ReportModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!report) return null

  const riskColor = 
    report.executive_summary?.risk_level === 'CRITICAL' ? '#EF4444' :
    report.executive_summary?.risk_level === 'HIGH' ? '#F59E0B' :
    report.executive_summary?.risk_level === 'MEDIUM' ? '#818CF8' :
    '#10B981'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 600,
              background: 'linear-gradient(145deg, #111116, #0e0e13)',
              borderLeft: `1px solid ${riskColor}25`,
              boxShadow: `-20px 0 60px rgba(0,0,0,0.6)`,
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <div
              className="px-6 py-5 flex items-center gap-4 shrink-0"
              style={{ borderBottom: `1px solid ${riskColor}18`, background: `${riskColor}08` }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${riskColor}18`, border: `1px solid ${riskColor}30` }}
              >
                <Bot className="w-5 h-5" style={{ color: riskColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-[#E4E4E7] leading-tight">AI Intelligence Report</h2>
                <p className="text-[11px] mt-0.5" style={{ color: riskColor }}>
                  {new Date(report.generated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <X className="w-4 h-4 text-[#71717A]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Original Video */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#52525B] mb-2">Original Video</p>
                <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-sm font-semibold text-[#E4E4E7]">{report.original_video?.title}</p>
                  <p className="text-xs text-[#71717A]">{report.original_video?.channel}</p>
                  {report.original_video?.url && (
                    <a href={report.original_video.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#6366F1] hover:underline block truncate">
                      {report.original_video.url}
                    </a>
                  )}
                </div>
              </motion.div>

              {/* Executive Summary */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#6366F1] mb-3">Executive Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                    <p className="text-[10px] text-[#52525B] mb-1">Total Matches</p>
                    <p className="text-2xl font-bold text-[#6366F1]">{report.executive_summary?.total_matches || 0}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: `${riskColor}08`, border: `1px solid ${riskColor}15` }}>
                    <p className="text-[10px] text-[#52525B] mb-1">Risk Level</p>
                    <p className="text-lg font-bold" style={{ color: riskColor }}>
                      {report.executive_summary?.risk_level || 'UNKNOWN'}
                    </p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <p className="text-[10px] text-[#52525B] mb-1">High Risk</p>
                    <p className="text-2xl font-bold text-[#EF4444]">{report.executive_summary?.high_risk || 0}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <p className="text-[10px] text-[#52525B] mb-1">Avg Similarity</p>
                    <p className="text-2xl font-bold text-[#F59E0B]">{((report.executive_summary?.average_similarity || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </motion.div>

              {/* AI Insights */}
              {report.ai_insights && report.ai_insights.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#2DD4BF] mb-3">🤖 AI Insights</p>
                  <div className="space-y-2">
                    {report.ai_insights.map((insight: string, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.05 }}
                        className="flex gap-3 p-3 rounded-xl"
                        style={{ backgroundColor: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.2)' }}
                      >
                        <AlertCircle className="w-4 h-4 text-[#2DD4BF] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#A1A1AA] leading-relaxed">{insight}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Recommendations */}
              {report.recommendations && report.recommendations.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#10B981] mb-3">✓ Recommended Actions</p>
                  <div className="space-y-2">
                    {report.recommendations.map((rec: string, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 + i * 0.05 }}
                        className="flex gap-3 p-3 rounded-xl"
                        style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#A1A1AA] leading-relaxed">{rec}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Top Detections */}
              {report.detections && report.detections.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#F59E0B] mb-3">Top Detections</p>
                  <div className="space-y-2">
                    {report.detections.slice(0, 5).map((det: any, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.35 + i * 0.05 }}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{
                          backgroundColor: det.risk === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                          border: det.risk === 'high' ? '1px solid rgba(239,68,68,0.15)' : '1px solid rgba(245,158,11,0.15)'
                        }}
                      >
                        <span className="text-[10px] font-bold" style={{ color: det.risk === 'high' ? '#EF4444' : '#F59E0B' }}>
                          #{det.rank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#E4E4E7] truncate">{det.title}</p>
                          <p className="text-[10px] text-[#71717A] truncate">{det.channel}</p>
                        </div>
                        <span className="text-xs font-mono font-bold shrink-0" style={{ color: det.risk === 'high' ? '#EF4444' : '#F59E0B' }}>
                          {(det.similarity * 100).toFixed(0)}%
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 shrink-0 border-t border-white/5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A1A1AA' }}
              >
                Close
              </button>
              {onExport && (
                <button
                  onClick={onExport}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)', boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
