// Owner: Aryan. Lets anyone signed in replace the temporary password an admin gave them.
import { useState, type FormEvent } from 'react'
import { isMockMode, supabase } from '../supabase.ts'
import { Button, Card, Field, FormStatus, Input, PageHeader } from '../ui/index.tsx'

export function AccountPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (password !== confirm) return setError("The two passwords don't match.")
    if (!supabase) return setError('Passwords can only be changed when the app is connected to the database.')
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(err.message)
    setPassword('')
    setConfirm('')
    setSuccess('Your password is changed. Use the new one next time you sign in.')
  }

  return (
    <>
      <PageHeader title="My account" />
      <Card title="Change password" description="Replace a temporary password from CIC with one only you know." className="max-w-md">
        <form onSubmit={submit} className="space-y-3">
          <Field id="new-password" label="New password" hint="8 to 72 characters.">
            <Input id="new-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" aria-describedby="new-password-hint" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field id="confirm-password" label="Type it again">
            <Input id="confirm-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <FormStatus error={error} success={success} />
          <Button type="submit" disabled={busy || isMockMode} className="w-full">{busy ? 'Saving…' : 'Change password'}</Button>
          {isMockMode && <p className="text-xs text-cic-muted">Demo mode: connect the database to change passwords.</p>}
        </form>
      </Card>
    </>
  )
}
