import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './shared/auth/AuthContext.tsx'
import { homePathFor } from './shared/auth/paths.ts'
import { isMockMode, supabase } from './shared/supabase.ts'
import type { Role } from './shared/types/db.ts'
import { Button, Card, Field, FormStatus, Input, PageHeader } from './shared/ui/index.tsx'
import { signInStudent, signInWithGoogle, signInWithRoster } from './api/student/auth.ts'
import { featuredCoursePath } from './home/featuredCourses.ts'
import { StudentSignupForm } from './student/auth/StudentSignupForm.tsx'

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

type Audience = 'student' | 'educator'

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

function GoogleAccess({ signup = false }: { signup?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function continueWithGoogle() {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Google sign-in failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {signup && <p className="text-sm text-cic-muted">
        Sign up to review CIC curriculum. If you need to teach or manage a class, contact your CIC administrator.
      </p>}
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void continueWithGoogle()}>
        <GoogleIcon /> {busy ? 'Connecting to Google…' : signup ? 'Sign up with Google' : 'Sign in with Google'}
      </Button>
      <FormStatus error={error} />
    </div>
  )
}

function SignInForm({ audience }: { audience: Audience }) {
  const { signInAsMock } = useAuth()
  const [useCard, setUseCard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const student = audience === 'student'

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const fields = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      if (useCard) {
        await signInWithRoster(String(fields.get('classCode')), String(fields.get('passcode')))
        return
      }
      const login = String(fields.get('username'))
      const password = String(fields.get('password'))
      if (student) {
        await signInStudent(login, password)
        return
      }
      const id = login.trim().toLowerCase()
      const email = id.includes('@') ? id : `${id}@${STAFF_DOMAIN}`
      if (supabase) {
        const { error: problem } = await supabase.auth.signInWithPassword({ email, password })
        if (problem) throw problem
      } else {
        const role = DEMO_STAFF[email]
        if (!role || password !== DEMO_PASSWORD) throw new Error('That username or password is not right.')
        signInAsMock(role)
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form key={useCard ? 'card' : 'password'} id="sign-in-form" onSubmit={handleSubmit} className="space-y-3">
        {useCard ? (
          <>
            <p className="text-sm text-cic-muted">Enter the class code and passcode printed on your card.</p>
            <Field id="roster-class-code" label="Class code">
              <Input id="roster-class-code" name="classCode" required maxLength={100} autoCapitalize="characters" autoComplete="username" spellCheck={false} />
            </Field>
            <Field id="roster-passcode" label="Your six-digit passcode">
              <Input id="roster-passcode" name="passcode" type="password" inputMode="numeric" pattern="[0-9]{6}"
                required minLength={6} maxLength={6} autoComplete="current-password" />
            </Field>
          </>
        ) : (
          <>
            <Field id="login-username" label={student ? 'Username or email' : 'Email or username'}>
              <Input id="login-username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field id="login-password" label="Password">
              <Input id="login-password" name="password" type="password" required autoComplete="current-password"
                maxLength={student ? 72 : undefined} />
            </Field>
          </>
        )}
        <FormStatus error={error} />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      {student ? (
        <Button variant="ghost" className="mt-2 w-full" aria-controls="sign-in-form" disabled={busy} onClick={() => {
          setUseCard(!useCard)
          setError(null)
        }}>
          {useCard ? 'Use a username and password' : 'Use a teacher login card'}
        </Button>
      ) : !isMockMode && (
        <div className="mt-4 border-t border-divider pt-4"><GoogleAccess /></div>
      )}
    </>
  )
}

export function AuthPage({ signup = false }: { signup?: boolean }) {
  const { profile, loading, signInAsMock } = useAuth()
  const [params, setParams] = useSearchParams()
  const audience: Audience = params.get('audience') === 'educator' ? 'educator' : 'student'
  const course = params.get('course')
  const coursePath = featuredCoursePath(course)
  const accountParams = new URLSearchParams()
  if (course && coursePath) accountParams.set('course', course)
  if (audience === 'educator') accountParams.set('audience', audience)
  const otherPage = (signup ? '/login' : '/signup') + (accountParams.size ? '?' + accountParams.toString() : '')

  function chooseAudience(next: Audience) {
    if (next === 'educator') accountParams.set('audience', next)
    else accountParams.delete('audience')
    setParams(accountParams, { replace: true })
  }

  if (profile) return <Navigate to={(profile.role === 'student' && coursePath) || homePathFor(profile.role)} replace />

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Link to="/" aria-label="CIC Learn home" className="mb-5 inline-grid size-18 place-items-center rounded-2xl border border-black/5 bg-white p-2 shadow-sm">
        <img src="/cic-logo.png" alt="Coding in Color" width={56} height={56} className="size-14 object-contain" />
      </Link>
      <PageHeader title={signup ? 'Create an account' : 'Sign in'} subtitle="CIC Learn" />
      {loading ? (
        <p role="status" className="text-sm text-cic-muted">Checking your sign-in…</p>
      ) : (
        <>
          <div role="group" aria-label="Account type" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-brand-tint p-1">
            {(['student', 'educator'] as const).map((option) => (
              <button key={option} type="button" aria-pressed={audience === option}
                onClick={() => chooseAudience(option)}
                className={`min-h-11 rounded-lg text-sm font-semibold ${
                  audience === option ? 'bg-white text-brand shadow-sm' : 'text-cic-muted hover:text-brand'
                }`}>
                {option === 'student' ? 'Student' : signup ? 'Educator' : 'Educator or staff'}
              </button>
            ))}
          </div>
          <Card>
            {signup ? (
              isMockMode ? <p className="text-sm text-cic-muted">Account creation is unavailable in demo mode.</p>
                : audience === 'student' ? <StudentSignupForm /> : <GoogleAccess signup />
            ) : audience === 'student' && isMockMode ? (
              <Button className="w-full" onClick={() => signInAsMock('student')}>Continue as a demo student</Button>
            ) : <SignInForm key={audience} audience={audience} />}
          </Card>
          <p className="mt-4 text-center text-sm text-cic-muted">
            {signup ? 'Already have an account?' : 'New to CIC Learn?'}{' '}
            <Link to={otherPage} className="font-semibold text-brand underline underline-offset-2">
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </>
      )}
    </main>
  )
}
