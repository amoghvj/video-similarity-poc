import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Logo } from '../components/Logo'

interface LoginPageProps {
  onNavigateToRegister: () => void
}

export function LoginPage({ onNavigateToRegister }: LoginPageProps) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#E4E4E7',
    outline: 'none',
    fontSize: '14px',
  } as const

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#09090B' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div
          className="rounded-2xl p-8"
          style={{
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <h1 className="text-xl font-semibold mb-1" style={{ color: '#E4E4E7' }}>
            Sign in
          </h1>
          <p className="text-sm mb-6" style={{ color: '#71717A' }}>
            Welcome back to VisionGuard
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: '#52525B' }}
              >
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: '#52525B' }}
              >
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#F87171',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
              style={{
                backgroundColor: '#6366F1',
                color: '#fff',
                opacity: isSubmitting || !email || !password ? 0.5 : 1,
                cursor: isSubmitting || !email || !password ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: '#71717A' }}>
            Don't have an account?{' '}
            <button
              onClick={onNavigateToRegister}
              className="font-medium transition-colors"
              style={{ color: '#818CF8' }}
            >
              Register
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
