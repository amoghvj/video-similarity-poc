import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Brain, Search, Share2, FileBarChart2, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

const STEPS = [
  { id: 'upload', label: 'Upload', icon: Upload, stageKeys: ['queued'] },
  { id: 'analyze', label: 'Vectorise', icon: Brain, stageKeys: ['extracting'] },
  { id: 'detect', label: 'Detect', icon: Search, stageKeys: ['searching', 'detecting'] },
  { id: 'propagate', label: 'Propagate', icon: Share2, stageKeys: [] },
  { id: 'report', label: 'Complete', icon: FileBarChart2, stageKeys: ['done'] },
]

function getStepState(stepIndex: number, status: string, stage: string) {
  if (status === 'completed') return 'done'
  if (status === 'failed') return stepIndex === 0 ? 'error' : 'pending'

  const stageOrder: Record<string, number> = {
    queued: 0, extracting: 1, searching: 2, detecting: 2, done: 4,
  }
  const currentIdx = stageOrder[stage] ?? 0

  if (stepIndex < currentIdx) return 'done'
  if (stepIndex === currentIdx) return 'active'
  return 'pending'
}

export function PipelineSection({ status, progress }: { status: string; progress: any }) {
  const stage = progress?.stage || 'queued'
  const percent = progress?.percent || 0
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'
  const isRunning = !isCompleted && !isFailed

  return (
    <>
      <style>{`
        @keyframes dataSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes neonPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      <section>
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="rounded-2xl px-8 py-6"
          style={{
            background: 'linear-gradient(145deg, #1a1a1f, #14141a)',
            border: `1px solid ${isCompleted ? 'rgba(16,185,129,0.2)' : isFailed ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
            boxShadow: isCompleted ? '0 0 40px rgba(16,185,129,0.06)' : 'none',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-3">
              <div
                className="w-1.5 h-6 rounded-full"
                style={{
                  backgroundColor: isCompleted ? '#10B981' : '#2DD4BF',
                  boxShadow: `0 0 12px ${isCompleted ? '#10B981' : '#2DD4BF'}`,
                }}
              />
              <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#A1A1AA' }}>
                Analysis Pipeline
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isRunning && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#6366F1' }} />}
              {isCompleted && <CheckCircle2 className="w-4 h-4" style={{ color: '#10B981' }} />}
              {isFailed && <AlertCircle className="w-4 h-4" style={{ color: '#EF4444' }} />}
              <span className="text-xs font-semibold" style={{ color: isCompleted ? '#10B981' : isFailed ? '#EF4444' : '#6366F1' }}>
                {progress?.details || (isCompleted ? 'Analysis Complete' : 'Pending')}
              </span>
              {isRunning && (
                <span className="text-xs font-mono" style={{ color: '#52525B' }}>
                  {percent}%
                </span>
              )}
            </div>
          </div>

          {/* Progress bar (running state only) */}
          {isRunning && (
            <div className="mb-6 relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #6366F1, #2DD4BF)' }}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
              {/* Data sweep shimmer */}
              <div
                className="absolute inset-0 w-1/4"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                  animation: 'dataSweep 1.8s ease-in-out infinite',
                }}
              />
            </div>
          )}

          {/* Steps */}
          <div className="relative flex items-start">
            {/* Neon connector line */}
            <div
              className="absolute top-5 left-5 right-5 h-[1px]"
              style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.15), rgba(45,212,191,0.15), rgba(99,102,241,0.15))' }}
            />
            {isRunning && (
              <div
                className="absolute top-5 h-[1px] left-5"
                style={{
                  width: `${percent}%`,
                  maxWidth: 'calc(100% - 40px)',
                  background: 'linear-gradient(90deg, #6366F1, #2DD4BF)',
                  boxShadow: '0 0 8px #6366F1',
                  transition: 'width 0.6s ease-out',
                }}
              />
            )}

            {/* Step nodes */}
            {STEPS.map((step, i) => {
              const stepState = getStepState(i, status, stage)
              const Icon = step.icon
              const isDone = stepState === 'done'
              const isActive = stepState === 'active'

              return (
                <motion.div
                  key={step.id}
                  className="flex-1 flex flex-col items-center gap-3 relative z-10"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  {/* Icon node */}
                  <motion.div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: isDone
                        ? 'rgba(16,185,129,0.15)'
                        : isActive
                        ? 'rgba(99,102,241,0.2)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${
                        isDone ? 'rgba(16,185,129,0.3)' : isActive ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'
                      }`,
                      boxShadow: isDone
                        ? '0 0 16px rgba(16,185,129,0.2)'
                        : isActive
                        ? '0 0 20px rgba(99,102,241,0.3)'
                        : 'none',
                    }}
                    animate={isActive ? { boxShadow: ['0 0 12px rgba(99,102,241,0.2)', '0 0 24px rgba(99,102,241,0.45)', '0 0 12px rgba(99,102,241,0.2)'] } : {}}
                    transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4" style={{ color: '#10B981' }} />
                    ) : (
                      <Icon
                        className={`w-4 h-4 ${isActive ? 'animate-pulse' : ''}`}
                        style={{ color: isActive ? '#818CF8' : '#3F3F46' }}
                      />
                    )}
                  </motion.div>

                  {/* Label */}
                  <div className="text-center">
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: isDone ? '#10B981' : isActive ? '#E4E4E7' : '#3F3F46' }}
                    >
                      {step.label}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </section>
    </>
  )
}
