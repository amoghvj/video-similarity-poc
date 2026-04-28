import { Card } from '../components/Card'
import { DetectionItem } from '../components/DetectionItem'
import { MetricCard } from '../components/MetricCard'
import type { Detection, MetricCard as MetricCardType, RiskSummary } from '../types'
import { AlertTriangle } from 'lucide-react'

interface MainGridSectionProps {
  detections: Detection[]
  metrics: MetricCardType[]
  riskSummary: RiskSummary
  selectedDetection: Detection | null
  onSelectDetection: (d: Detection) => void
}

function RiskDistributionBar({ summary }: { summary: RiskSummary }) {
  const total = summary.high + summary.medium + summary.low
  const highPercent = (summary.high / total) * 100
  const mediumPercent = (summary.medium / total) * 100
  const lowPercent = (summary.low / total) * 100
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#2DD4BF' }}>Risk Distribution</p>
          <p className="text-2xl font-bold" style={{ color: '#E4E4E7' }}>{total}</p>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: '#71717A' }}>Total Detections</p>
        </div>
      </div>
      
      <div className="space-y-2">
        {[
          { label: 'High Risk', count: summary.high, color: '#EF4444', percent: highPercent },
          { label: 'Medium Risk', count: summary.medium, color: '#F59E0B', percent: mediumPercent },
          { label: 'Low Risk', count: summary.low, color: '#10B981', percent: lowPercent },
        ].map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: '#A1A1AA' }}>{item.label}</span>
              <span className="text-xs font-bold" style={{ color: item.color }}>{item.count} ({item.percent.toFixed(0)}%)</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${item.percent}%`, backgroundColor: item.color, boxShadow: `0 0 12px ${item.color}40` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MainGridSection({
  detections,
  metrics,
  riskSummary,
  selectedDetection,
  onSelectDetection,
}: MainGridSectionProps) {
  return (
    <section aria-labelledby="main-grid-title" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #EF4444, #F59E0B)' }} />
          <div>
            <h2 id="main-grid-title" className="text-lg font-bold uppercase tracking-wider" style={{ color: '#E4E4E7' }}>
              Detection Intelligence
            </h2>
            <p className="text-xs mt-1" style={{ color: '#71717A' }}>Real-time copyright infringement analysis</p>
          </div>
        </div>
        <div
          className="px-3 py-1.5 rounded-lg text-sm font-bold"
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          {detections.filter((d) => d.risk === 'high').length} High Risk
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Detection List */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          {/* Top threat alert */}
          {detections.length > 0 && (
            <div
              className="p-4 rounded-xl flex flex-col gap-2 border backdrop-blur-sm hover:border-red-500/50 transition-colors"
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: '#EF4444' }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#EF4444' }}>Top Threat</p>
              </div>
              <p className="text-sm font-semibold truncate" style={{ color: '#E4E4E7' }}>
                {detections[0]?.title}
              </p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
                <span className="text-xs" style={{ color: '#A1A1AA' }}>{detections[0]?.channel}</span>
                <span className="text-xs font-mono font-bold px-2 py-1 rounded-md" style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
                  {(detections[0]?.similarity * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* All Detections */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#52525B' }}>
                Detections
              </p>
              <span className="px-2 py-1 text-xs font-semibold rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#A1A1AA' }}>
                {detections.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {detections.map((d, i) => (
                <DetectionItem
                  key={d.id}
                  detection={d}
                  rank={i + 1}
                  isSelected={selectedDetection?.id === d.id}
                  onSelect={onSelectDetection}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Metrics & Summary */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#52525B' }}>
              Key Metrics
            </p>
            <div className="grid grid-cols-2 gap-3">
              {metrics.map((m, i) => (
                <MetricCard
                  key={m.label}
                  metric={m}
                  accent={i === 0 || i === 1 ? '#2DD4BF' : '#6366F1'}
                />
              ))}
            </div>
          </div>

          {/* Risk Distribution Card */}
          <div
            className="p-4 rounded-xl border"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <RiskDistributionBar summary={riskSummary} />
          </div>

          {/* Top Channels Card */}
          <div
            className="p-4 rounded-xl border flex-1"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#52525B' }}>
              Top Channels
            </p>
            <div className="space-y-2.5">
              {detections.slice(0, 4).map((d, idx) => (
                <div key={d.id} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                      style={{
                        background: `linear-gradient(135deg, ${d.risk === 'high' ? '#EF4444' : d.risk === 'medium' ? '#F59E0B' : '#10B981'}, transparent)`,
                        border: '1.5px solid rgba(255,255,255,0.15)',
                        boxShadow: `0 0 12px ${d.risk === 'high' ? '#EF4444' : d.risk === 'medium' ? '#F59E0B' : '#10B981'}20`,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: '#E4E4E7' }}>{d.channel}</p>
                      <p className="text-[10px]" style={{ color: '#71717A' }}>{d.views.toLocaleString()} views</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded shrink-0" style={{
                    color: d.risk === 'high' ? '#EF4444' : d.risk === 'medium' ? '#F59E0B' : '#10B981',
                    backgroundColor: d.risk === 'high' ? 'rgba(239,68,68,0.15)' : d.risk === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'
                  }}>
                    {(d.similarity * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
