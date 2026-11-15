// Student sign in / create account. Owner: Shivraj (UI follows the staff sign-in on LoginPage).
import { useState, type FormEvent } from 'react'
import { signInStudent, signInWithGoogle, signUpStudent } from '../../api/student/auth.ts'
import { Button, Card, Field, FormStatus, Input } from '../../shared/ui/index.tsx'

type Mode = 'sign-in' | 'sign-up'

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

export function StudentAuthCard() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [classCode, setClassCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSignUp = mode === 'sign-up'

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      // On success the auth listener loads the profile and LoginPage redirects.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void run(() =>
      isSignUp
        ? signUpStudent({ email, password, displayName: name, school, classCode })
        : signInStudent(email, password),
    )
  }

  return (
    <Card title={isSignUp ? 'Create your student account' : 'Student sign in'}>
      <div className="space-y-4">
        <Button type="button" variant="secondary" className="w-full gap-2" disabled={busy} onClick={() => void run(signInWithGoogle)}>
          <GoogleIcon />
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 text-xs text-cic-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-divider" />
          or use email
          <span className="h-px flex-1 bg-divider" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp && (
            <Field id="student-name" label="Your name">
              <Input
                id="student-name"
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field id="student-email" label="Email">
            <Input
              id="student-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="student-password" label="Password" hint={isSignUp ? 'At least 8 characters.' : undefined}>
            <Input
              id="student-password"
              type="password"
              required
              minLength={isSignUp ? 8 : undefined}
              maxLength={72}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              aria-describedby={isSignUp ? 'student-password-hint' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {isSignUp && (
            <>
              <Field id="student-school" label="School" optional>
                <Input
                  id="student-school"
                  maxLength={120}
                  autoComplete="organization"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                />
              </Field>
              <Field
                id="student-class-code"
                label="Class code"
                optional
                hint="Got a code from your teacher? Enter it to join their class. You can also add it later."
              >
                <Input
                  id="student-class-code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="student-class-code-hint"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                />
              </Field>
            </>
          )}

          <FormStatus error={error} />

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-cic-muted">
          {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="font-semibold text-brand underline underline-offset-2"
            onClick={() => switchMode(isSignUp ? 'sign-in' : 'sign-up')}
          >
            {isSignUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </Card>
  )
}
