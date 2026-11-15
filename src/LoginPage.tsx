import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './shared/auth/AuthContext.tsx'
import { homePathFor } from './shared/auth/paths.ts'
import { isMockMode, supabase } from './shared/supabase.ts'
import type { Role } from './shared/types/db.ts'
import { Button, Card, Field, FormStatus, Input, PageHeader } from './shared/ui/index.tsx'
import { signInWithGoogle } from './api/student/auth.ts'
import { StudentAuthCard } from './student/auth/StudentAuthCard.tsx'

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

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
            {a === 'student' ? 'Student' : 'Teacher or admin'}
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
        <Card title="Teacher and admin sign in">
          <form onSubmit={handleStaffLogin} className="space-y-3">
            <Field id="staff-login" label="Email or username">
              <Input
                id="staff-login"
                name="username"
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
                name="password"
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
          {!isMockMode && (
            <div className="mt-5 border-t border-divider pt-4">
              <p className="mb-2 text-sm text-cic-muted">K-12 teacher or district reviewer? Review CIC's curriculum with your school Google account.</p>
              <Button type="button" variant="secondary" className="w-full gap-2"
                onClick={() => void signInWithGoogle().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Google sign-in failed.'))}>
                <GoogleIcon /> Educator sign in with Google
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
