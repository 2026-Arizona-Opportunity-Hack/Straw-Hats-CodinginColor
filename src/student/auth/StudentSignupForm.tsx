import { useState, type FormEvent } from 'react'
import { signInStudent, signUpStudent } from '../../api/student/auth.ts'
import { Button, Field, FormStatus, Input } from '../../shared/ui/index.tsx'

export function StudentSignupForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<(Awaited<ReturnType<typeof signUpStudent>> & { password: string }) | null>(null)
  const [copied, setCopied] = useState(false)

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fields = new FormData(e.currentTarget)
    const password = String(fields.get('new-password'))
    void run(async () => {
      const result = await signUpStudent({
        firstName: String(fields.get('firstName')).trim(),
        lastName: String(fields.get('lastName')).trim(),
        password,
        classCode: String(fields.get('classCode')).trim(),
      })
      setCreated({ ...result, password })
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
      <div className="space-y-4">
        <div className="space-y-2" role="status">
          <h2 className="text-lg">Your account is ready</h2>
          <p>
            Save your username. You'll use it with your password each time you sign in.
          </p>
          <p className="break-all font-mono text-xl font-bold text-brand">{created.username}</p>
          {created.joinedClass && <p className="text-sm text-cic-muted">You joined {created.joinedClass.class_name}.</p>}
        </div>
        <Button variant="secondary" onClick={() => void copy(created.username)}>{copied ? 'Copied' : 'Copy username'}</Button>
        <FormStatus error={error} />
        <Button className="w-full" disabled={busy} onClick={() => void run(() => signInStudent(created.username, created.password))}>
          {busy ? 'Signing in…' : 'Start learning'}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="student-first" label="First name">
          <Input id="student-first" name="firstName" required maxLength={50} autoComplete="given-name" />
        </Field>
        <Field id="student-last" label="Last name">
          <Input id="student-last" name="lastName" required maxLength={50} autoComplete="family-name" />
        </Field>
      </div>
      <Field id="new-student-password" label="Choose a password" hint="At least 8 characters.">
        <Input id="new-student-password" name="new-password" type="password" required minLength={8} maxLength={72}
          autoComplete="new-password" aria-describedby="new-student-password-hint" />
      </Field>
      <Field id="student-class-code" label="Class code" optional
        hint="Enter the code from your teacher to join their class. You can also add it later.">
        <Input id="student-class-code" name="classCode" autoCapitalize="characters" autoComplete="off"
          spellCheck={false} aria-describedby="student-class-code-hint" />
      </Field>
      <p className="text-sm text-cic-muted">We'll give you a username to sign in. No email needed.</p>
      <FormStatus error={error} />
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
    </form>
  )
}
