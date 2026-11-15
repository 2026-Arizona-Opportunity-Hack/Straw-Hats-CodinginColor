// Owner: Jacky. Student home: browse topics, open a topic's lessons, join a class.
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Lock, PlayCircle, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { joinClass, type JoinedClass } from '../api/student/auth.ts'
import { listModuleStatus, listMyCourses, type ModuleStatus } from '../api/student/index.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { isMockMode } from '../shared/supabase.ts'
import type { Course, CourseLevel } from '../shared/types/db.ts'
import { Badge, Button, Card, EmptyState, Field, FormStatus, Input } from '../shared/ui/index.tsx'
import { TOPICS, type Topic } from './topics.ts'

const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

/** Catalog topics, plus any published course an instructor made that the catalog doesn't list yet. */
function buildTopics(courses: Course[]): Topic[] {
  const known = new Set(TOPICS.map((t) => t.courseId).filter(Boolean))
  const extra: Topic[] = courses
    .filter((c) => !known.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, description: c.description, glyph: c.title.slice(0, 2), level: c.level, courseId: c.id, outline: [] }))
  const published = new Set(courses.map((c) => c.id))
  // A catalog topic only links to its course once that course is published for this student.
  return [...TOPICS.map((t) => (t.courseId && !published.has(t.courseId) ? { ...t, courseId: undefined } : t)), ...extra]
}

function progressText(modules: ModuleStatus[] | undefined, topic: Topic) {
  if (!topic.courseId) return `${topic.outline.length} lessons · coming soon`
  if (!modules) return 'Loading…'
  if (modules.length === 0) return 'Lessons coming soon'
  const done = modules.filter((m) => m.state === 'completed').length
  return done === 0 ? `${modules.length} lessons` : `${done} of ${modules.length} lessons done`
}

function TopicTile({ topic, modules, selected, onSelect }: {
  topic: Topic
  modules: ModuleStatus[] | undefined
  selected: boolean
  onSelect: () => void
}) {
  const available = !!topic.courseId
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`dot-hover soft-card flex h-full flex-col gap-3 rounded-2xl border-2 bg-white p-4 text-left ${
        selected ? 'border-brand' : 'border-transparent hover:border-divider'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className={`grid h-12 min-w-12 place-items-center rounded-xl px-2 font-mono text-lg font-bold ${
            available ? 'brand-panel text-white' : 'bg-brand-tint text-brand'
          }`}
        >
          {topic.glyph}
        </span>
        <Badge tone={available ? 'brand' : 'neutral'}>{LEVEL_LABEL[topic.level]}</Badge>
      </div>
      <span className="text-lg font-bold leading-snug text-brand">{topic.title}</span>
      <span className="text-sm text-cic-muted">{topic.description}</span>
      <span className="mt-auto text-sm font-semibold">{progressText(modules, topic)}</span>
    </button>
  )
}

/** The selected topic's lessons, in order, like a code.org lesson path. */
function LessonPath({ topic, modules }: { topic: Topic; modules: ModuleStatus[] | undefined }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  // When the student picks another topic, move keyboard focus to its lessons (not on page load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [topic.id])

  const rows = topic.courseId
    ? (modules ?? []).map((m) => ({ key: m.module_id, title: m.title, state: m.state, href: `/student/module/${m.module_id}` }))
    : topic.outline.map((title) => ({ key: title, title, state: 'soon' as const, href: '' }))

  return (
    <section aria-labelledby="lesson-path-title" className="soft-card rounded-2xl border border-divider bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="lesson-path-title" ref={headingRef} tabIndex={-1} className="text-2xl">{topic.title}</h2>
          <p className="text-sm text-cic-muted">
            {topic.courseId ? 'Finish a lesson to unlock the next one.' : 'Your teacher hasn’t opened this course yet. Here’s what you’ll learn.'}
          </p>
        </div>
      </div>
      {topic.courseId && !modules && <p role="status">Loading lessons…</p>}
      {topic.courseId && modules?.length === 0 && <EmptyState title="No lessons yet" description="Your teacher is still adding lessons to this course." />}
      <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-0.5 before:bg-divider">
        {rows.map((row, i) => {
          const open = row.state === 'available'
          return (
            <li key={row.key} className="relative flex items-center gap-4">
              <span
                aria-hidden="true"
                className={`relative z-10 grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  row.state === 'completed' ? 'bg-brand text-white'
                    : open ? 'bg-white text-brand ring-2 ring-brand-accent'
                    : 'bg-canvas text-cic-muted ring-1 ring-cic-gray'
                }`}
              >
                {row.state === 'completed' ? <CheckCircle2 className="size-5" /> : i + 1}
              </span>
              <div className={`flex min-h-14 flex-1 flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2 ${open ? 'bg-brand-tint' : 'bg-brand-subtle'}`}>
                <span className={`font-semibold ${row.state === 'soon' || row.state === 'locked' ? 'text-cic-muted' : ''}`}>
                  <span className="sr-only">Lesson {i + 1}: </span>{row.title}
                </span>
                {row.state === 'available' && (
                  <Link to={row.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
                    <PlayCircle aria-hidden="true" className="size-4" /> Start lesson
                  </Link>
                )}
                {row.state === 'completed' && (
                  <Link to={row.href} className="text-sm font-semibold text-brand underline">Review</Link>
                )}
                {row.state === 'locked' && (
                  <span className="inline-flex items-center gap-1 text-sm text-cic-muted"><Lock aria-hidden="true" className="size-4" /> Locked</span>
                )}
                {row.state === 'soon' && <span className="text-sm text-cic-muted">Coming soon</span>}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function JoinClassCard() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // TODO(Shivraj): replace with a listMyClasses() call so joined classes survive a reload.
  const [classes, setClasses] = useState<JoinedClass[]>([])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setError('Enter the class code your teacher gave you.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const joined = isMockMode
        ? { class_id: `mock-${trimmed}`, class_name: `Class ${trimmed}`, course_id: 'course-intro-python' }
        : await joinClass(trimmed)
      if (classes.some((c) => c.class_id === joined.class_id)) throw new Error('You’re already in this class.')
      setClasses((prev) => [...prev, joined])
      setSuccess(`You joined ${joined.class_name}.`)
      setCode('')
      void queryClient.invalidateQueries({ queryKey: ['myCourses'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="My classes" description="Join your teacher’s class to see the lessons they assign.">
      {classes.length === 0 ? (
        <p className="mb-5 flex items-center gap-2 text-cic-muted"><Users aria-hidden="true" className="size-5" /> You’re not in any classes yet.</p>
      ) : (
        <ul className="mb-5 space-y-2">
          {classes.map((c) => (
            <li key={c.class_id} className="flex items-center gap-2 rounded-lg bg-brand-subtle px-3 py-2 font-semibold">
              <Users aria-hidden="true" className="size-4 text-brand" /> {c.class_name}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <Field id="class-code" label="Class code" hint="Ask your teacher for this code.">
            <Input
              id="class-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MVP3-7Q"
              autoComplete="off"
              aria-describedby="class-code-hint"
              className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy} className="sm:mb-[22px]">{busy ? 'Joining…' : 'Join class'}</Button>
      </form>
      <div className="mt-3"><FormStatus error={error} success={success} /></div>
    </Card>
  )
}

export function StudentHome() {
  const { profile } = useAuth()
  const firstName = profile?.display_name.split(' ')[0]
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['myCourses'], queryFn: listMyCourses })
  const topics = buildTopics(courses)

  const statuses = useQueries({
    queries: topics.map((t) => ({
      queryKey: ['moduleStatus', t.courseId],
      queryFn: () => listModuleStatus(t.courseId!),
      enabled: !!t.courseId,
    })),
  })
  const modulesFor = (i: number) => (topics[i].courseId ? statuses[i]?.data : undefined)

  const [params, setParams] = useSearchParams()
  const selectedIndex = Math.max(0, topics.findIndex((t) => t.id === params.get('topic')))
  const selected = topics[selectedIndex]

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl tracking-tight sm:text-4xl">{firstName ? `Hi, ${firstName}` : 'Welcome'}</h1>
        <p className="mt-1 text-base text-cic-muted">Pick a topic to see its lessons, or join your teacher’s class below.</p>
      </header>

      <section aria-labelledby="topics-title" className="mb-8">
        <h2 id="topics-title" className="mb-4 text-xl">Topics</h2>
        {isLoading && <p role="status" className="mb-3 text-sm text-cic-muted">Loading your courses…</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {topics.map((t, i) => (
            <TopicTile
              key={t.id}
              topic={t}
              modules={modulesFor(i)}
              selected={i === selectedIndex}
              onSelect={() => setParams({ topic: t.id }, { replace: true })}
            />
          ))}
        </div>
      </section>

      {selected && <div className="mb-8"><LessonPath topic={selected} modules={modulesFor(selectedIndex)} /></div>}

      <JoinClassCard />
    </>
  )
}
