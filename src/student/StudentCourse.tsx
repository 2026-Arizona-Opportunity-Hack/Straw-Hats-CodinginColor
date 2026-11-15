// Owner: Jacky. Route /student/course/:topicId: one course on its own page, like a CodeHS course view.
// Header with progress and the next lesson; below, every lesson in order with its steps.
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, PlayCircle, RotateCcw, School } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Badge, EmptyState } from '../shared/ui/index.tsx'
import { LEVEL_LABEL, isOpen, itemForClass, nextRow, useMyClasses, useStudentCatalog, type Row } from './catalog.ts'
import { STEP } from './stepTypes.ts'

function LessonCard({ row, index }: { row: Row; index: number }) {
  const open = row.state === 'available' || row.state === 'in_progress'
  const muted = row.state === 'locked' || row.state === 'soon'
  const steps = row.module?.lessons.flatMap((l) => l.activities) ?? []
  const done = new Set(row.doneIds ?? [])
  return (
    <li className={`soft-card rounded-2xl border bg-white p-5 ${open ? 'border-brand-accent' : 'border-divider'}`}>
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className={`grid size-11 shrink-0 place-items-center rounded-full font-bold ${
            row.state === 'completed' ? 'bg-brand text-white' : open ? 'bg-white text-brand ring-2 ring-brand-accent' : 'bg-canvas text-cic-muted ring-1 ring-cic-gray'
          }`}
        >
          {row.state === 'completed' ? <CheckCircle2 className="size-5" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={`text-lg ${muted ? '!text-cic-muted' : ''}`}><span className="sr-only">Lesson {index + 1}: </span>{row.title}</h2>
          {row.detail && <p className="text-sm text-cic-muted">{row.detail}</p>}
        </div>
        {open && (
          <Link to={row.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-dark">
            <PlayCircle aria-hidden="true" className="size-4" /> {row.state === 'in_progress' ? 'Continue' : 'Start lesson'}<span className="sr-only">: {row.title}</span>
          </Link>
        )}
        {row.state === 'completed' && (
          <Link to={row.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand px-4 font-semibold text-brand hover:bg-brand-tint">
            <RotateCcw aria-hidden="true" className="size-4" /> Review<span className="sr-only">: {row.title}</span>
          </Link>
        )}
        {row.state === 'locked' && <span className="inline-flex items-center gap-1 text-sm text-cic-muted"><Lock aria-hidden="true" className="size-4" /> Finish the lesson before this one</span>}
        {row.state === 'soon' && <span className="text-sm text-cic-muted">Coming soon</span>}
      </div>

      {steps.length > 0 && (
        <ol aria-label={`Steps in ${row.title}`} className="mt-4 grid gap-1 border-t border-divider pt-4">
          {steps.map((a) => {
            const meta = STEP[a.type]
            const finished = done.has(a.id)
            return (
              <li key={a.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${finished ? 'bg-brand-subtle' : ''}`}>
                {finished
                  ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-brand" />
                  : <meta.icon aria-hidden="true" className={`size-4 shrink-0 ${muted ? 'text-cic-gray' : 'text-cic-muted'}`} />}
                <span className={muted ? 'text-cic-muted' : ''}>{a.title || meta.label}</span>
                <span className="ml-auto text-xs text-cic-muted">{meta.label}{finished && <span className="sr-only">, done</span>}</span>
              </li>
            )
          })}
        </ol>
      )}
    </li>
  )
}

export function StudentCourse() {
  const { topicId = '' } = useParams()
  const { items, isLoading } = useStudentCatalog()
  const { data: classes = [] } = useMyClasses()
  const item = items.find((it) => it.topic.id === topicId)

  const back = (
    <Link to="/student" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> My dashboard
    </Link>
  )
  if (!item) {
    return <>{back}{isLoading ? <p role="status">Loading course…</p> : <EmptyState title="Course not found" description="It may have been removed or renamed." />}</>
  }

  const { topic, rows, loading, error } = item
  const myClass = classes.find((c) => itemForClass(c, items)?.topic.id === topic.id)
  const done = rows.filter((r) => r.state === 'completed').length
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0
  const next = nextRow(rows)

  return (
    <div className="mx-auto max-w-4xl">
      {back}
      <header className="soft-card mb-8 flex flex-col gap-5 rounded-2xl border border-divider bg-white p-6 sm:flex-row sm:items-start">
        <span aria-hidden="true" className={`grid size-16 shrink-0 place-items-center rounded-2xl font-mono text-2xl font-bold ${isOpen(topic) ? 'brand-panel text-white' : 'bg-brand-tint text-brand'}`}>
          {topic.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-2">
            <Badge tone="brand">{LEVEL_LABEL[topic.level]}</Badge>
            {myClass ? <Badge tone="info"><School aria-hidden="true" /> {myClass.name}</Badge> : isOpen(topic) && <Badge>Self-paced</Badge>}
          </div>
          <h1 className="text-3xl tracking-tight sm:text-4xl">{topic.title}</h1>
          <p className="mt-1 text-cic-muted">{topic.description}</p>
          {isOpen(topic) && rows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex min-w-48 flex-1 items-center gap-3">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-divider" role="img" aria-label={`Course progress: ${done} of ${rows.length} lessons`}>
                  <div className="h-full rounded-full bg-brand-accent" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-semibold tabular-nums">{done} of {rows.length} lessons</span>
              </div>
              {next ? (
                <Link to={next.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark">
                  {next.state === 'in_progress' ? 'Continue' : done === 0 ? 'Start course' : 'Next lesson'} <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              ) : <Badge tone="brand"><CheckCircle2 aria-hidden="true" /> Course complete</Badge>}
            </div>
          )}
        </div>
      </header>

      <section aria-label="Lessons">
        {!isOpen(topic) && <p className="mb-4 rounded-xl bg-brand-tint px-4 py-3 text-sm">This course isn’t open yet. Here’s what you’ll learn once your teacher publishes it.</p>}
        {loading && <p role="status">Loading lessons…</p>}
        {error && <p role="alert">Could not load these lessons. Try reloading.</p>}
        {isOpen(topic) && !loading && !error && rows.length === 0 && <EmptyState title="No lessons yet" description="Your teacher is still adding lessons to this course." />}
        <ol className="space-y-4">
          {rows.map((row, i) => <LessonCard key={row.key} row={row} index={i} />)}
        </ol>
      </section>
    </div>
  )
}
