import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './shared/auth/AuthContext.tsx'
import { homePathFor } from './shared/auth/paths.ts'
import { isMockMode, supabase } from './shared/supabase.ts'
import type { Role } from './shared/types/db.ts'
import { Button, Card, PageHeader } from './shared/ui/index.tsx'
import { StudentAuthCard } from './student/auth/StudentAuthCard.tsx'

const ROLES: Role[] = ['student', 'instructor', 'admin', 'reviewer']

type Audience = 'student' | 'staff'

export function LoginPage() {
  const { profile, signInAsMock } = useAuth()
  const [audience, setAudience] = useState<Audience>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (profile) return <Navigate to={homePathFor(profile.role)} replace />

  async function handleStaffLogin(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <span className="mb-5 inline-grid size-18 place-items-center rounded-2xl border border-black/5 bg-white p-2 shadow-sm">
        <img src="/cic-logo.png" alt="Coding in Color" width={56} height={56} className="size-14 object-contain" />
      </span>
      <PageHeader title="CIC Learn" subtitle="Coding in Color's learning platform" />
      {isMockMode ? (
        <Card title="Mock mode: pick a role">
          <p className="mb-4 text-sm text-slate-600">
            No Supabase keys in <code>.env</code>, so the app runs on mock data.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((role) => (
              <Button key={role} variant="secondary" onClick={() => signInAsMock(role)} className="capitalize">
                {role}
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <>
        <div role="group" aria-label="I am a" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-brand-tint p-1">
          {(['student', 'staff'] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={audience === a}
              onClick={() => setAudience(a)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${
                audience === a ? 'bg-white text-brand shadow-sm' : 'text-cic-muted hover:text-brand'
              }`}
            >
              {a === 'student' ? 'Student' : 'Teacher or staff'}
            </button>
          ))}
        </div>
        {audience === 'student' ? (
          <StudentAuthCard />
        ) : (
        <Card title="Staff sign in">
          <form onSubmit={handleStaffLogin} className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </Card>
        )}
        </>
      )}
    </div>
  )
}
