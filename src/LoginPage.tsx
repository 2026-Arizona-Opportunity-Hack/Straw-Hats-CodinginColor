import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './shared/auth/AuthContext.tsx'
import { homePathFor } from './shared/auth/paths.ts'
import { isMockMode, supabase } from './shared/supabase.ts'
import type { Role } from './shared/types/db.ts'
import { Button, Card, Field, FormStatus, Input, PageHeader } from './shared/ui/index.tsx'
import { StudentAuthCard } from './student/auth/StudentAuthCard.tsx'

type Audience = 'student' | 'staff'

/** A username without "@" signs in as username@STAFF_DOMAIN, e.g. "admin" → admin@cic.demo. */
const STAFF_DOMAIN = (import.meta.env.VITE_STAFF_EMAIL_DOMAIN as string | undefined) || 'cic.demo'

// Mock mode has no database, so it accepts the demo logins from supabase/seed.sql.
// With Supabase configured, sign-in always goes through Supabase Auth.
const DEMO_PASSWORD = 'cic-learn-demo'
const DEMO_STAFF: Record<string, Role> = {
  [`admin@${STAFF_DOMAIN}`]: 'admin',
  [`teacher@${STAFF_DOMAIN}`]: 'instructor',
  [`reviewer@${STAFF_DOMAIN}`]: 'reviewer',
}

export function LoginPage() {
  const { profile, signInAsMock } = useAuth()
  const [audience, setAudience] = useState<Audience>('student')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (profile) return <Navigate to={homePathFor(profile.role)} replace />

  async function handleStaffLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const id = login.trim().toLowerCase()
    const email = id.includes('@') ? id : `${id}@${STAFF_DOMAIN}`
    if (isMockMode) {
      const role = DEMO_STAFF[email]
      if (role && password === DEMO_PASSWORD) signInAsMock(role)
      else setError('That username or password is not right.')
      return
    }
    const { error: err } = await supabase!.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <span className="mb-5 inline-grid size-18 place-items-center rounded-2xl border border-black/5 bg-white p-2 shadow-sm">
        <img src="/cic-logo.png" alt="Coding in Color" width={56} height={56} className="size-14 object-contain" />
      </span>
      <PageHeader title="CIC Learn" subtitle="Coding in Color's learning platform" />
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
        isMockMode ? (
          <Card title="Student demo">
            <p className="mb-4 text-sm text-cic-muted">No database is connected, so students use a demo account.</p>
            <Button className="w-full" onClick={() => signInAsMock('student')}>Continue as a demo student</Button>
          </Card>
        ) : (
          <StudentAuthCard />
        )
      ) : (
        <Card title="Staff sign in">
          <form onSubmit={handleStaffLogin} className="space-y-3">
            <Field id="staff-login" label="Email or username">
              <Input
                id="staff-login"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            </Field>
            <Field id="staff-password" label="Password">
              <Input
                id="staff-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <FormStatus error={error} />
            <Button type="submit" className="w-full">Sign in</Button>
          </form>
        </Card>
      )}
    </div>
  )
}
