// Student sign in / create account. Owner: Shivraj (UI follows the staff sign-in on LoginPage).
// Students have no email: sign-up asks for first and last name, then shows the generated
// username (jsmith1) to keep for next time. Google sign-in is for educators (LoginPage).
import { useState, type FormEvent } from 'react'
import { signInStudent, signInWithRoster, signUpStudent } from '../../api/student/auth.ts'
import { Button, Card, Field, FormStatus, Input } from '../../shared/ui/index.tsx'

type Mode = 'card' | 'sign-in' | 'sign-up'

export function StudentAuthCard({ initialMode = 'card' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [passcode, setPasscode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [classCode, setClassCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set after sign-up: the new username, shown before signing in. */
  const [created, setCreated] = useState<{ username: string; className: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

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
      // After sign-in the auth listener loads the profile and LoginPage redirects.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      if (mode === 'card') return signInWithRoster(classCode, passcode)
      if (!isSignUp) return signInStudent(username, password)
      const result = await signUpStudent({ firstName, lastName, password, classCode })
      setCreated({ username: result.username, className: result.joinedClass?.class_name ?? null })
    })
  }

  async function copy(name: string) {
    try {
      await navigator.clipboard.writeText(name)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (created) {
    return (
      <Card title="Your account is ready!">
        <div className="space-y-4" role="status">
          <p>
            Your username is below. <strong>Write it down</strong>: you'll use it with your password every time you sign in.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-brand bg-brand-tint px-4 py-3">
            <span className="font-mono text-2xl font-bold tracking-wide text-brand">{created.username}</span>
            <Button type="button" variant="secondary" onClick={() => void copy(created.username)}>{copied ? 'Copied ✓' : 'Copy'}</Button>
          </div>
          {created.className && <p className="text-sm text-cic-muted">You joined {created.className}.</p>}
          <FormStatus error={error} />
          <Button type="button" className="w-full" disabled={busy} onClick={() => void run(() => signInStudent(created.username, password))}>
            {busy ? 'Signing in…' : 'Start learning →'}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card title={isSignUp ? 'Create your student account' : 'Student sign in'}>
      <div className="space-y-4">
        {mode === 'card' ? <>
          <p className="text-sm text-cic-muted">Use the login card from your teacher.</p>
          {/* key: a fresh form per mode. Distinct ids/names let password managers tell sign-in
            (fill saved password) from sign-up (suggest a strong one). */}
        <form key={mode} onSubmit={handleSubmit} className="space-y-3">
            <Field id="roster-class-code" label="Class code">
              <Input id="roster-class-code" required maxLength={100} autoCapitalize="characters" autoComplete="username"
                value={classCode} onChange={e => setClassCode(e.target.value.toUpperCase())} />
            </Field>
            <Field id="roster-passcode" label="Your six-digit passcode">
              <Input id="roster-passcode" type="password" inputMode="numeric" pattern="[0-9]{6}" required minLength={6} maxLength={6}
                autoComplete="current-password" value={passcode} onChange={e => setPasscode(e.target.value)} />
            </Field>
            <FormStatus error={error} />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</Button>
          </form>
          <button type="button" className="text-sm font-semibold text-brand underline" disabled={busy}
            onClick={() => switchMode('sign-in')}>Use a username account instead</button>
        </> : <>
        <button type="button" className="text-sm font-semibold text-brand underline" disabled={busy}
          onClick={() => switchMode('card')}>Use a login card</button>
        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="student-first" label="First name">
                <Input id="student-first" required maxLength={50} autoComplete="given-name" value={firstName}
                  onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field id="student-last" label="Last name">
                <Input id="student-last" required maxLength={50} autoComplete="family-name" value={lastName}
                  onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field id="student-username" label="Username" hint="Like jsmith1. Existing email accounts can still use their email.">
              <Input id="student-username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false}
                aria-describedby="student-username-hint" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
          )}
          <Field id={isSignUp ? 'new-student-password' : 'student-password'} label={isSignUp ? 'Choose a password' : 'Password'} hint={isSignUp ? 'At least 8 characters.' : undefined}>
            <Input
              id={isSignUp ? 'new-student-password' : 'student-password'}
              name={isSignUp ? 'new-password' : 'password'}
              type="password"
              required
              minLength={isSignUp ? 8 : undefined}
              maxLength={72}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              aria-describedby={isSignUp ? 'new-student-password-hint' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {isSignUp && (
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
          )}
          {isSignUp && <p className="text-sm text-cic-muted">We'll make your username from your name. No email needed.</p>}

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
        </>}
      </div>
    </Card>
  )
}
