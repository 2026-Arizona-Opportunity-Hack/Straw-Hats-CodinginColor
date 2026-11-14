// Owner: Aryan. Admin landing page: the five-second answer to "how are CIC's classes doing?"
import { ArrowRight, BarChart3, KeyRound, School, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ActivityType } from '../shared/types/activities.ts'
import { Card, EmptyState, PageHeader, StatTile } from '../shared/ui/index.tsx'
import { LoadState, StatusBadge } from './common.tsx'
import { useOrg } from './hooks.ts'
import { analyze, fmtGain, fmtPct, timeAgo } from './metrics.ts'

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  content: 'Reading',
  video: 'Video',
  check: 'Check question',
  worksheet: 'Worksheet',
  code: 'Coding exercise',
  interactive_html: 'Interactive page',
  exit: 'Exit question',
  pretest: 'Pretest',
  posttest: 'Post-test',
}

const QUICK = [
  { to: '/admin/classes#new-class', label: 'Create a class', icon: School },
  { to: '/admin/users', label: 'Manage people & roles', icon: Users },
  { to: '/admin/analytics', label: 'View impact report', icon: BarChart3 },
  { to: '/admin/settings#api-keys', label: 'Create an API key', icon: KeyRound },
]

export function OverviewPage() {
  const { data, isLoading, error } = useOrg()
  if (!data) return <><PageHeader title="Overview" /><LoadState isLoading={isLoading} error={error} /></>

  const a = analyze(data)
  const attention = a.students
    .filter((s) => s.status === 'stuck' || s.status === 'not_started')
    .sort((x, y) => (x.status === y.status ? 0 : x.status === 'stuck' ? -1 : 1))
    .slice(0, 6)
  const names = new Map(data.people.map((p) => [p.id, p.display_name]))
  const actById = new Map(data.activities.map((x) => [x.id, x]))
  const modTitle = new Map(data.modules.map((m) => [m.id, m.title]))
  const recent = data.attempts
    .filter((x) => x.submitted_at)
    .sort((x, y) => (y.submitted_at! > x.submitted_at! ? 1 : -1))
    .slice(0, 8)

  return (
    <>
      <PageHeader title="Overview" subtitle="How Coding in Color's classes are doing right now." />

      <nav aria-label="Quick actions" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="dot-hover soft-card flex items-center gap-3 rounded-2xl border border-divider bg-white p-4 transition-transform hover:-translate-y-0.5 text-sm font-semibold text-brand hover:border-brand"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-white">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="kpis" className="mb-8">
        <h2 id="kpis" className="sr-only">Key numbers</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile label="Schools" value={String(a.schoolOptions.length)} hint={`${data.classes.length} ${data.classes.length === 1 ? 'class' : 'classes'}`} />
          <StatTile label="Students" value={String(a.overall.students)} hint="Enrolled in a class" />
          <StatTile label="Module completion" value={fmtPct(a.overall.completionPct)} hint="Of modules in progress" />
          <StatTile label="Avg learning gain" value={fmtGain(a.overall.avgGain)} hint="Post-test minus pretest" />
          <StatTile
            label="Need attention"
            value={String(a.overall.stuck + a.overall.notStarted)}
            hint={`${a.overall.stuck} stuck · ${a.overall.notStarted} not started`}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Students needing attention"
          description="Stuck for a week, failing the same activity, or not started."
          action={
            <Link to="/admin/analytics#attention" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand hover:underline">
              See all <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        >
          {attention.length === 0 ? (
            <EmptyState title="Everyone is moving" description="No student is stuck or waiting to start." />
          ) : (
            <ul className="divide-y divide-divider">
              {attention.map((s) => (
                <li key={`${s.classId}-${s.studentId}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-sm text-cic-muted">{a.classOf.get(s.classId)?.name} · {s.reason}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Recent activity" description="Latest student submissions across all classes.">
          {recent.length === 0 ? (
            <EmptyState title="No submissions yet" description="Activity shows up here as soon as students start working." />
          ) : (
            <ul className="divide-y divide-divider">
              {recent.map((r, i) => {
                const act = actById.get(r.activity_id)
                return (
                  <li key={i} className="py-3 text-sm">
                    <p>
                      <span className="font-semibold">{names.get(r.student_id)}</span> submitted{' '}
                      <span className="font-semibold">{act ? ACTIVITY_LABEL[act.type] : 'an activity'}</span>
                    </p>
                    <p className="text-cic-muted">
                      {act ? modTitle.get(act.module_id) : ''} · {a.classOf.get(r.class_id)?.name} · {timeAgo(r.submitted_at)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
