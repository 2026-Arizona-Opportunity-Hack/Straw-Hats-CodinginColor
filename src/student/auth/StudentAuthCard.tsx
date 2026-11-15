// New students use roster cards; legacy accounts retain their original sign-in.
import { useState, type FormEvent } from 'react'
import { signInStudent, signInWithGoogle, signInWithRoster } from '../../api/student/auth.ts'
import { Button, Card, Field, FormStatus, Input } from '../../shared/ui/index.tsx'

export function StudentAuthCard() {
  const [legacy, setLegacy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [classCode, setClassCode] = useState('')
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await action() }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void run(() => legacy ? signInStudent(email, password) : signInWithRoster(classCode, passcode))
  }

  return (
    <Card title={legacy ? 'Existing student account' : 'Student sign in'}>
      <div className="space-y-4">
        <p className="text-sm text-cic-muted">{legacy
          ? 'Use this only if you already have an email or Google account with CIC Learn.'
          : 'Use the login card from your teacher. You do not need an email address.'}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          {legacy ? <>
            <Field id="student-email" label="Existing account email">
              <Input id="student-email" type="email" required autoComplete="username"
                value={email} onChange={e => setEmail(e.target.value)} />
            </Field>
            <Field id="student-password" label="Password">
              <Input id="student-password" type="password" required maxLength={72} autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)} />
            </Field>
          </> : <>
            <Field id="roster-class-code" label="Class code">
              <Input id="roster-class-code" required maxLength={100} autoCapitalize="characters" autoComplete="username"
                value={classCode} onChange={e => setClassCode(e.target.value.toUpperCase())} />
            </Field>
            <Field id="roster-passcode" label="Your six-digit passcode">
              <Input id="roster-passcode" type="password" inputMode="numeric" pattern="[0-9]{6}" required minLength={6} maxLength={6}
                autoComplete="current-password" value={passcode} onChange={e => setPasscode(e.target.value)} />
            </Field>
          </>}
          <FormStatus error={error} />
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</Button>
        </form>
        {legacy && <Button type="button" variant="secondary" className="w-full" disabled={busy}
          onClick={() => void run(signInWithGoogle)}>Sign in to an existing Google account</Button>}
        <button type="button" className="text-sm font-semibold text-brand underline" disabled={busy}
          onClick={() => { setLegacy(!legacy); setError(null) }}>
          {legacy ? 'Use a login card' : 'I already have an email or Google account'}
        </button>
        {!legacy && <p className="text-sm text-cic-muted">New here? Ask your teacher for a login card.</p>}
      </div>
    </Card>
  )
}
