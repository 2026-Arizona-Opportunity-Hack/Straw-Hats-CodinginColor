// Owner: Aryan. Small pieces shared by the admin pages.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, CircleDashed, PlayCircle } from 'lucide-react'
import { Badge, Button, EmptyState } from '../shared/ui/index.tsx'
import { setArchived } from './api.ts'
import { ORG_KEY } from './hooks.ts'
import type { Status } from './metrics.ts'

const STATUS: Record<Status, { label: string; tone: 'danger' | 'warn' | 'success' | 'info'; Icon: typeof AlertTriangle }> = {
  stuck: { label: 'Stuck', tone: 'danger', Icon: AlertTriangle },
  not_started: { label: 'Not started', tone: 'warn', Icon: CircleDashed },
  on_track: { label: 'On track', tone: 'info', Icon: PlayCircle },
  done: { label: 'Complete', tone: 'success', Icon: CheckCircle2 },
}

/** Status always carries an icon + word, never color alone. */
export function StatusBadge({ status }: { status: Status }) {
  const { label, tone, Icon } = STATUS[status]
  return (
    <Badge tone={tone}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  )
}

export function LoadState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) return <p role="status" className="text-cic-muted">Loading…</p>
  if (error)
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Couldn't load this"
        description={error instanceof Error ? error.message : 'Something went wrong. Try reloading.'}
      />
    )
  return null
}

/** Archive / restore toggle for a person or class. Archiving keeps all data; it only leaves active lists. */
export function ArchiveButton({ table, id, name, archived }: { table: 'classes' | 'profiles'; id: string; name: string; archived: boolean }) {
  const qc = useQueryClient()
  const run = useMutation({
    mutationFn: () => setArchived(table, id, !archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEY }),
    onError: (e) => window.alert(e.message),
  })
  return (
    <Button
      size="sm"
      variant={archived ? 'secondary' : 'ghost'}
      disabled={run.isPending}
      onClick={() => {
        if (archived || window.confirm(`Archive ${name}? Their records stay in reports and history, and you can restore them anytime.`)) run.mutate()
      }}
    >
      {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
      {archived ? 'Restore' : 'Archive'}<span className="sr-only"> {name}</span>
    </Button>
  )
}
