// Owner: Aryan. Small pieces shared by the admin pages.
import { AlertTriangle, CheckCircle2, CircleDashed, PlayCircle } from 'lucide-react'
import { Badge, EmptyState } from '../shared/ui/index.tsx'
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
        title="Couldn't load this page"
        description={error instanceof Error ? error.message : 'Something went wrong. Try reloading.'}
      />
    )
  return null
}
