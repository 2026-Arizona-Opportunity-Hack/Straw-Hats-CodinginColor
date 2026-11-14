// Owner: Jacky. Plays a module one step at a time, like a code.org lesson:
// progress bar, one activity per screen, "Continue" unlocks when the step is done.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, Flag } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getModule, listModuleStatus } from '../api/student/index.ts'
import type { Activity } from '../shared/types/db.ts'
import { Badge, Button, Card, EmptyState } from '../shared/ui/index.tsx'
import { ActivityRenderer } from './activities.tsx'

const TYPE_LABEL: Record<Activity['type'], string> = {
  content: 'Read',
  video: 'Watch',
  check: 'Check',
  worksheet: 'Worksheet',
  code: 'Code',
  interactive_html: 'Try it',
  exit: 'Exit question',
  pretest: 'Pretest',
  posttest: 'Post-test',
}

// TODO(Shivraj): real class id comes from the student's enrollment.
const CLASS_ID = 'TODO'

export function ModulePlayer() {
  const { moduleId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: mod, isLoading } = useQuery({ queryKey: ['module', moduleId], queryFn: () => getModule(moduleId) })
  const { data: siblings = [] } = useQuery({
    queryKey: ['moduleStatus', mod?.course_id],
    queryFn: () => listModuleStatus(mod!.course_id),
    enabled: !!mod,
  })

  const steps = useMemo(
    () => (mod?.lessons ?? []).flatMap((lesson) => lesson.activities.map((activity) => ({ lesson, activity }))),
    [mod],
  )
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState<Record<string, true>>({})
  const startedAt = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Restart the time-on-task clock and move keyboard focus to the new step.
  useEffect(() => {
    startedAt.current = Date.now()
    headingRef.current?.focus()
  }, [index])

  if (isLoading) return <p role="status">Loading module…</p>
  if (!mod) return <EmptyState title="Module not found" description="It may be locked or unpublished." action={<Link to="/student" className="underline">Back to my courses</Link>} />
  if (steps.length === 0) return <EmptyState title="This module is empty" description="Your instructor has not added activities yet." />

  const finished = index >= steps.length
  const current = steps[Math.min(index, steps.length - 1)]
  const currentDone = !!done[current.activity.id] || !current.activity.counts_toward_unlock
  const completedCount = steps.filter((s) => done[s.activity.id]).length
  const pct = Math.round((Math.min(index, steps.length) / steps.length) * 100)
  const position = siblings.findIndex((s) => s.module_id === mod.id)
  const nextModule = position >= 0 ? siblings[position + 1] : undefined

  function finishModule() {
    setIndex(steps.length)
    // TODO(Shivraj): unlocking should come from the server; refetch so the home page updates.
    void queryClient.invalidateQueries({ queryKey: ['moduleStatus'] })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/student" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> My courses
      </Link>

      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-cic-muted">{mod.title} · {current.lesson.title}</p>
        <p className="text-sm tabular-nums text-cic-muted">
          {finished ? 'Complete' : `Step ${index + 1} of ${steps.length}`}
        </p>
      </div>

      {/* Progress dots: shape + text, never color alone. */}
      <ol className="mb-6 flex gap-1.5" aria-label={`Progress: ${pct}%`}>
        {steps.map((s, i) => {
          const state = done[s.activity.id] ? 'done' : i === index ? 'current' : 'todo'
          return (
            <li key={s.activity.id} className="flex-1">
              <button
                type="button"
                onClick={() => i <= index && setIndex(i)}
                disabled={i > index}
                aria-current={state === 'current' ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${TYPE_LABEL[s.activity.type]}${state === 'done' ? ', done' : ''}`}
                className={`h-3 w-full rounded-full ${state === 'done' ? 'bg-brand-accent' : state === 'current' ? 'bg-brand' : 'bg-divider'}`}
              />
            </li>
          )
        })}
      </ol>

      {finished ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-14 text-brand-accent" aria-hidden="true" />
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl">Module complete!</h1>
            <p className="text-cic-muted">You finished {completedCount} of {steps.length} activities in {mod.title}.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {nextModule ? (
                <Button onClick={() => navigate(`/student/module/${nextModule.module_id}`)}>
                  Next: {nextModule.title} <ArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <Badge tone="brand"><Flag aria-hidden="true" /> Course finished</Badge>
              )}
              <Button variant="secondary" onClick={() => navigate('/student')}>Back to my courses</Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="brand">{TYPE_LABEL[current.activity.type]}</Badge>
            {current.lesson.is_checkpoint && <Badge tone="info"><Flag aria-hidden="true" /> Checkpoint</Badge>}
            <h1 ref={headingRef} tabIndex={-1} className="sr-only">
              Step {index + 1}: {TYPE_LABEL[current.activity.type]}
            </h1>
          </div>
          <ActivityRenderer
            activity={current.activity}
            classId={CLASS_ID}
            elapsedMs={() => Date.now() - startedAt.current}
            done={!!done[current.activity.id]}
            onDone={() => setDone((d) => ({ ...d, [current.activity.id]: true }))}
          />
        </Card>
      )}

      {!finished && (
        <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Module steps">
          <Button variant="ghost" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
            <ArrowLeft aria-hidden="true" /> Back
          </Button>
          <div className="flex items-center gap-3">
            {!currentDone && <span className="text-sm text-cic-muted">Finish this step to continue</span>}
            <Button
              onClick={() => {
                // Optional steps (reading, video) count as done once the student moves past them.
                setDone((d) => ({ ...d, [current.activity.id]: true }))
                if (index === steps.length - 1) finishModule()
                else setIndex((i) => i + 1)
              }}
              disabled={!currentDone}
            >
              {index === steps.length - 1 ? 'Finish module' : 'Continue'} <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
