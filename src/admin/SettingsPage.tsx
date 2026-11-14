// Owner: Aryan. API keys for CIC's read API (create once-visible keys, revoke).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { Badge, Button, Card, DataTable, EmptyState, Field, FormStatus, Input, PageHeader, Td, Th } from '../shared/ui/index.tsx'
import { createApiKey, listApiKeys, revokeApiKey } from './api.ts'
import { LoadState } from './common.tsx'
import { timeAgoOrDate } from './metrics.ts'

const KEYS = ['admin', 'api-keys'] as const

export function SettingsPage() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const keys = useQuery({ queryKey: KEYS, queryFn: listApiKeys })
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const create = useMutation({
    mutationFn: (label: string) => createApiKey(label, profile!.id),
    onSuccess: (key) => { setError(null); setCopied(false); setCreated(key); return qc.invalidateQueries({ queryKey: KEYS }) },
    onError: (e) => { setCreated(null); setError(e.message) },
  })
  const revoke = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS }),
    onError: (e) => setError(e.message),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const label = String(new FormData(form).get('label') ?? '').trim()
    setCreated(null)
    if (label.length < 2) return setError('Give the key a name, e.g. "CIC org dashboard".')
    create.mutate(label, { onSuccess: () => form.reset() })
  }

  return (
    <>
      <PageHeader title="Settings & API" subtitle="Keys that let other CIC tools read progress and learning-gain summaries." />

      <Card id="api-keys" title="API keys" description="Keys can only read aggregate numbers (no student names). Only a SHA-256 hash is stored, and a revoked key stops working immediately.">
        <div className="flex flex-col gap-6">
          <LoadState isLoading={keys.isLoading} error={keys.error} />
          {keys.data && (keys.data.length === 0 ? (
            <EmptyState icon={<KeyRound />} title="No API keys yet" description="Create one when a dashboard or report needs CIC Learn data." />
          ) : (
            <DataTable caption="API keys">
              <thead><tr><Th>Name</Th><Th>Created</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {keys.data.map((k) => (
                  <tr key={k.id}>
                    <Td className="font-semibold">{k.label}</Td>
                    <Td className="text-cic-muted">{timeAgoOrDate(k.created_at)}</Td>
                    <Td>{k.revoked_at ? <Badge>Revoked {timeAgoOrDate(k.revoked_at)}</Badge> : <Badge tone="success">Active</Badge>}</Td>
                    <Td className="text-right">
                      {!k.revoked_at && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={revoke.isPending}
                          onClick={() => {
                            if (window.confirm(`Revoke "${k.label}"? Anything using this key stops working immediately. This can't be undone.`)) revoke.mutate(k.id)
                          }}
                        >
                          Revoke<span className="sr-only"> {k.label}</span>
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ))}

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <h3 className="text-base">Create a key</h3>
            <Field id="key-label" label="Key name" hint="Name it after whatever will use it, so you know what breaks if you revoke it.">
              <Input id="key-label" name="label" required minLength={2} aria-describedby="key-label-hint" placeholder="e.g. CIC org dashboard" className="sm:max-w-sm" />
            </Field>
            <div><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create key'}</Button></div>
            <FormStatus error={error} success={created ? "Copy this key now. It's stored hashed and can't be shown again." : null}>
              {created && (
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-divider bg-white px-2 py-1.5 font-mono text-xs text-black">{created}</code>
                  <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(created).then(() => setCopied(true))}>
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              )}
            </FormStatus>
          </form>
        </div>
      </Card>

    </>
  )
}
