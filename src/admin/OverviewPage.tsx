// Owner: Aryan. Admin home: headline numbers, instructor issues to act on, and hiring.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Mail } from 'lucide-react'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Select, StatTile } from '../shared/ui/index.tsx'
import { resolveIssue, setApplicationStatus, type ApplicationStatus } from './api.ts'
import { LoadState } from './common.tsx'
import { useApplications, useIssues, useOrg } from './hooks.ts'
import { analyze, fmtGain, fmtPct, greeting, timeAgo, weeklyActivity } from './metrics.ts'

const STAGES: { value: ApplicationStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer sent' },
  { value: 'hired', label: 'Hired' },
  { value: 'not_selected', label: 'Not selected' },
]

export function OverviewPage() {
  const { data, isLoading, error, dataUpdatedAt } = useOrg()
  const { profile } = useAuth()
  const a = data && analyze(data)
  const keep = new Set(a?.classes.map((c) => c.id))
  const weeks = data ? weeklyActivity(data.attempts.filter((x) => keep.has(x.class_id))) : []
  const [prev, cur] = weeks.slice(-2)
  const schools = new Set(a?.classes.map((c) => c.school)).size

  return (
    <>
      <header className="mb-8">
        <p className="text-sm font-semibold text-cic-muted">
          {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(dataUpdatedAt || undefined)}
        </p>
        <h1 className="text-3xl tracking-tight sm:text-4xl">{greeting()}, {profile?.display_name}</h1>
        <p className="mt-1 text-base text-cic-muted">
          {a ? `Here's Coding in Color today across ${schools} ${schools === 1 ? 'school' : 'schools'} and ${a.classes.length} classes.` : 'Loading today…'}
        </p>
      </header>
      {a ? (
        <section aria-labelledby="kpis" className="mb-8">
          <h2 id="kpis" className="sr-only">Key numbers</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Activity this week" value={`${cur.submissions}`} hint="Lessons and activities submitted" trend={weeks.map((w) => w.submissions)} change={cur.submissions - prev.submissions} />
            <StatTile label="Active learners" value={`${cur.learners}`} hint={`of ${a.overall.students} enrolled students`} trend={weeks.map((w) => w.learners)} change={cur.learners - prev.learners} />
            <StatTile label="Module completion" value={fmtPct(a.overall.completionPct)} hint="Of modules in progress" />
            <StatTile label="Avg learning gain" value={fmtGain(a.overall.avgGain)} hint="Post-test minus pretest" />
            <StatTile label="Need attention" value={String(a.overall.stuck + a.overall.notStarted)} hint={`${a.overall.stuck} stuck · ${a.overall.notStarted} not started`} />
          </div>
        </section>
      ) : (
        <LoadState isLoading={isLoading} error={error} />
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <IssuesCard />
        <HiringCard />
      </div>
    </>
  )
}

function IssuesCard() {
  const qc = useQueryClient()
  const issues = useIssues()
  const [showResolved, setShowResolved] = useState(false)
  const resolve = useMutation({ mutationFn: resolveIssue, onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'issues'] }) })
  const open = issues.data?.filter((i) => i.status === 'open') ?? []
  const list = showResolved ? (issues.data ?? []) : open

  return (
    <Card
      id="issues"
      className="lg:col-span-3"
      title={`Issues from instructors${issues.data ? ` (${open.length} open)` : ''}`}
      description="Problems instructors have raised. Reply or mark them resolved."
      action={
        issues.data && issues.data.length > open.length && (
          <Button size="sm" variant="ghost" aria-pressed={showResolved} onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </Button>
        )
      }
    >
      <LoadState isLoading={issues.isLoading} error={issues.error} />
      {issues.data && list.length === 0 && <EmptyState icon={<CheckCircle2 />} title="No open issues" description="Instructors haven't raised anything that needs you." />}
      <ul className="divide-y divide-divider">
        {list.map((i) => (
          <li key={i.id} className="flex flex-col gap-2 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">{i.subject}</p>
              {i.status === 'resolved' ? <Badge tone="success">Resolved</Badge> : <Badge tone="warn">Open</Badge>}
            </div>
            <p className="text-sm text-cic-muted">
              {i.instructor_name}{i.class_name && ` · ${i.class_name}`} · {timeAgo(i.created_at)}
            </p>
            <p className="text-sm">{i.message}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`mailto:${i.contact_email}?subject=${encodeURIComponent(`Re: ${i.subject}`)}`}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-brand px-3 text-sm font-semibold text-brand hover:bg-brand-tint"
              >
                <Mail aria-hidden="true" className="size-4" /> Contact {i.instructor_name}
              </a>
              {i.status === 'open' && (
                <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate(i.id)}>
                  Mark resolved<span className="sr-only">: {i.subject}</span>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {resolve.error && <p role="alert" className="text-sm text-danger">{resolve.error.message}</p>}
    </Card>
  )
}

function HiringCard() {
  const qc = useQueryClient()
  const apps = useApplications()
  const [tab, setTab] = useState<'applications' | 'hires'>('applications')
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => setApplicationStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'applications'] }),
  })
  const pending = apps.data?.filter((x) => x.status !== 'hired' && x.status !== 'not_selected') ?? []
  const hires = apps.data?.filter((x) => x.status === 'hired') ?? []

  return (
    <Card id="hiring" className="lg:col-span-2" title="Hiring" description="Applications for open roles and recent hires.">
      {apps.data && <div role="group" aria-label="Show" className="mb-3 flex gap-1 rounded-lg bg-brand-tint p-1">
        {([['applications', `Applications (${pending.length})`], ['hires', `Recent hires (${hires.length})`]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-white text-brand shadow-sm' : 'text-black hover:text-brand'}`}
          >
            {label}
          </button>
        ))}
      </div>}
      <LoadState isLoading={apps.isLoading} error={apps.error} />
      {apps.data && (tab === 'applications' ? pending : hires).length === 0 && (
        <EmptyState title={tab === 'applications' ? 'No open applications' : 'No recent hires'} />
      )}
      <ul className="divide-y divide-divider">
        {(tab === 'applications' ? pending : hires).map((x) => (
          <li key={x.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{x.name}</p>
              <p className="text-sm text-cic-muted">
                {x.role}{x.school && ` · ${x.school}`} · {tab === 'hires' ? `hired ${timeAgo(x.updated_at)}` : `applied ${timeAgo(x.applied_at)}`}
              </p>
            </div>
            {tab === 'applications' ? (
              <div className="w-36">
                <label htmlFor={`stage-${x.id}`} className="sr-only">Stage for {x.name}</label>
                <Select
                  id={`stage-${x.id}`}
                  value={x.status}
                  disabled={update.isPending}
                  onChange={(e) => update.mutate({ id: x.id, status: e.target.value as ApplicationStatus })}
                  className="h-9 w-full"
                >
                  {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </div>
            ) : (
              <a href={`mailto:${x.email}`} className="text-sm font-semibold text-brand hover:underline">Email {x.name.split(' ')[0]}</a>
            )}
          </li>
        ))}
      </ul>
      {update.error && <p role="alert" className="text-sm text-danger">{update.error.message}</p>}
    </Card>
  )
}
