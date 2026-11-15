// Owner: Jacky. Student home: pick up where you left off, browse topics, open a lesson, join a class.
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Lock, PlayCircle, RotateCcw, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { joinClass } from '../api/student/auth.ts'
import { listModuleStatus, listMyCourses, type ModuleStatus, type StudentCourse } from '../api/student/index.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { isLocalDemo, isMockMode } from '../shared/supabase.ts'
import type { CourseLevel } from '../shared/types/db.ts'
import { Badge, Button, Card, EmptyState, Field, FormStatus, Input } from '../shared/ui/index.tsx'
import {
  joinLocalClass, joinedClasses, lessonRows, publishedCourses, resumeTarget,
  type JoinedLocalClass, type LessonRow, type PublishedCourse,
} from './instructorContent.ts'
import { TOPICS, topicIdForCourse, type Topic } from './topics.ts'

const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced', 'expert']
const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

/** A topic plus where its lessons come from (see topics.ts). */
type ViewTopic = Topic & { local?: PublishedCourse }

function buildTopics(courses: StudentCourse[], local: PublishedCourse[]): ViewTopic[] {
  const published = new Set(courses.map((c) => c.id))
  const byId = new Map(local.map((c) => [c.id, c]))
  const catalog = TOPICS.map((t): ViewTopic => {
    const localCourse = t.instructorCourseId ? byId.get(t.instructorCourseId) : undefined
    if (localCourse) return { ...t, courseId: undefined, local: localCourse }
    return t.courseId && !published.has(t.courseId) ? { ...t, courseId: undefined } : t
  })
  const listedLocal = new Set(TOPICS.map((t) => t.instructorCourseId))
  const listedApi = new Set(TOPICS.map((t) => t.courseId))
  const toLevel = (level: string) => (LEVELS.includes(level.toLowerCase() as CourseLevel) ? (level.toLowerCase() as CourseLevel) : 'beginner')
  const glyph = (title: string) => title.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  // Courses an instructor made that the catalog doesn't list yet still get a tile.
  const extraLocal = local.filter((c) => !listedLocal.has(c.id)).map((c): ViewTopic => ({
    id: c.id, title: c.title, description: c.description, glyph: glyph(c.title), level: toLevel(c.level), outline: [], local: c,
  }))
  const extraApi = courses.filter((c) => !listedApi.has(c.id)).map((c): ViewTopic => ({
    id: c.id, title: c.title, description: c.description, glyph: glyph(c.title), level: c.level, courseId: c.id, outline: [],
  }))
  return [...catalog, ...extraLocal, ...extraApi]
}

type Row = { key: string; title: string; state: 'locked' | 'available' | 'in_progress' | 'completed' | 'soon'; href: string; detail?: string }

function rowsFor(topic: ViewTopic, apiModules: ModuleStatus[] | undefined, localRows: LessonRow[]): Row[] {
  if (topic.local) {
    return localRows.map(({ module, state, doneSteps, totalSteps }) => ({
      key: module.id, title: module.title, state, href: `/student/demo/${module.id}`,
      detail: state === 'in_progress' ? `${doneSteps} of ${totalSteps} steps` : `${totalSteps} steps`,
    }))
  }
  if (topic.courseId) return (apiModules ?? []).map((m) => ({ key: m.module_id, title: m.title, state: m.state, href: `/student/module/${m.module_id}` }))
  return topic.outline.map((title) => ({ key: title, title, state: 'soon', href: '' }))
}

function progressText(topic: ViewTopic, rows: Row[], loading: boolean) {
  if (!topic.local && !topic.courseId) return `${topic.outline.length} lessons · coming soon`
  if (loading) return 'Loading…'
  if (rows.length === 0) return 'Lessons coming soon'
  const done = rows.filter((r) => r.state === 'completed').length
  return done === 0 ? `${rows.length} lesson${rows.length === 1 ? '' : 's'}` : `${done} of ${rows.length} lessons done`
}

function TopicTile({ topic, text, selected, onSelect }: { topic: ViewTopic; text: string; selected: boolean; onSelect: () => void }) {
  const available = !!(topic.local || topic.courseId)
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
          className={`grid h-12 min-w-12 place-items-center rounded-xl px-2 font-mono text-lg font-bold ${available ? 'brand-panel text-white' : 'bg-brand-tint text-brand'}`}
        >
          {topic.glyph}
        </span>
        <Badge tone={available ? 'brand' : 'neutral'}>{LEVEL_LABEL[topic.level]}</Badge>
      </div>
      <span className="text-lg font-bold leading-snug text-brand">{topic.title}</span>
      <span className="text-sm text-cic-muted">{topic.description}</span>
      <span className="mt-auto text-sm font-semibold">{text}</span>
    </button>
  )
}

/** The selected topic's lessons in order, like a code.org lesson path. Each button opens the lesson player. */
function LessonPath({ topic, rows, loading, error }: { topic: ViewTopic; rows: Row[]; loading: boolean; error: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownTopic = useRef(topic.id)
  // When the student picks another topic, move keyboard focus to its lessons (not on page load).
  useEffect(() => {
    if (shownTopic.current === topic.id) return
    shownTopic.current = topic.id
    headingRef.current?.focus()
  }, [topic.id])

  const live = !!(topic.local || topic.courseId)
  return (
    <section aria-labelledby="lesson-path-title" className="soft-card rounded-2xl border border-divider bg-white p-5 sm:p-6">
      <div className="mb-5">
        <h2 id="lesson-path-title" ref={headingRef} tabIndex={-1} className="text-2xl focus:outline-none">{topic.title}</h2>
        <p className="text-sm text-cic-muted">
          {live ? 'Finish a lesson to unlock the next one.' : 'Your teacher hasn’t opened this course yet. Here’s what you’ll learn.'}
        </p>
      </div>
      {loading && <p role="status">Loading lessons…</p>}
      {error && <p role="alert">Could not load these lessons. Try reloading.</p>}
      {live && !loading && !error && rows.length === 0 && <EmptyState title="No lessons yet" description="Your teacher is still adding lessons to this course." />}
      <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-0.5 before:bg-divider">
        {rows.map((row, i) => {
          const open = row.state === 'available' || row.state === 'in_progress'
          const muted = row.state === 'soon' || row.state === 'locked'
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
                <span className="flex flex-col">
                  <span className={`font-semibold ${muted ? 'text-cic-muted' : ''}`}><span className="sr-only">Lesson {i + 1}: </span>{row.title}</span>
                  {row.detail && !muted && <span className="text-xs text-cic-muted">{row.detail}</span>}
                </span>
                {open && (
                  <Link to={row.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
                    <PlayCircle aria-hidden="true" className="size-4" /> {row.state === 'in_progress' ? 'Continue' : 'Start lesson'}
                    <span className="sr-only">: {row.title}</span>
                  </Link>
                )}
                {row.state === 'completed' && (
                  <Link to={row.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand underline">
                    <RotateCcw aria-hidden="true" className="size-4" /> Review<span className="sr-only">: {row.title}</span>
                  </Link>
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

function JoinClassCard({ studentId, onJoined }: { studentId: string; onJoined: (topicId: string | null) => void }) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Local demo: classes come from the instructor workspace in this browser and survive a reload.
  // TODO(Shivraj): live mode needs listMyClasses() so joined classes survive a reload there too.
  const [classes, setClasses] = useState<JoinedLocalClass[]>(() => (isLocalDemo ? joinedClasses(studentId) : []))

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
      let joined: JoinedLocalClass
      if (isLocalDemo) {
        joined = joinLocalClass(studentId, trimmed)
      } else if (isMockMode) {
        if (classes.some((c) => c.id === `mock-${trimmed}`)) throw new Error('You’re already in this class.')
        joined = { id: `mock-${trimmed}`, name: `Class ${trimmed}`, school: '', courseId: '' }
      } else {
        const live = await joinClass(trimmed)
        joined = { id: live.class_id, name: live.class_name, school: '', courseId: live.course_id }
      }
      setClasses((prev) => [...prev, joined])
      setSuccess(`You joined ${joined.name}.`)
      setCode('')
      void queryClient.invalidateQueries({ queryKey: ['myCourses'] })
      onJoined(isLocalDemo && joined.courseId ? topicIdForCourse(joined.courseId) : null)
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
            <li key={c.id} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-brand-subtle px-3 py-2">
              <Users aria-hidden="true" className="size-4 text-brand" />
              <span className="font-semibold">{c.name}</span>
              {c.school && <span className="text-sm text-cic-muted">{c.school}</span>}
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
              placeholder="e.g. MARY3"
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
  const studentId = profile?.id ?? 'guest'
  const firstName = profile?.display_name.split(' ')[0]
  const { data: courses = [], isLoading, isError } = useQuery({ queryKey: ['myCourses', profile?.id], queryFn: listMyCourses })
  const local = useMemo(() => publishedCourses(), [])
  const topics = buildTopics(courses, local)
  const resume = useMemo(() => (isLocalDemo ? resumeTarget(studentId) : null), [studentId])

  const statuses = useQueries({
    queries: topics.map((t) => ({
      queryKey: ['moduleStatus', profile?.id, t.courseId],
      queryFn: () => listModuleStatus(t.courseId!),
      enabled: !!t.courseId,
    })),
  })
  const rows = topics.map((t, i) => rowsFor(t, statuses[i]?.data, t.local ? lessonRows(studentId, t.local) : []))

  const [params, setParams] = useSearchParams()
  const selectedIndex = Math.max(0, topics.findIndex((t) => t.id === params.get('topic')))
  const selected = topics[selectedIndex]
  const select = (id: string) => setParams({ topic: id }, { replace: true })

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl tracking-tight sm:text-4xl">{firstName ? `Hi, ${firstName}` : 'Welcome'}</h1>
        <p className="mt-1 text-base text-cic-muted">Pick a topic to see its lessons, or join your teacher’s class below.</p>
      </header>

      {resume && (
        <section aria-label="Pick up where you left off" className="brand-panel mb-8 flex flex-col gap-4 rounded-2xl p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-sidebar-muted">Pick up where you left off</p>
            <p className="text-xl font-bold">{resume.row.module.title}</p>
            <p className="text-sm text-sidebar-muted">{resume.course.title}: {resume.row.doneSteps} of {resume.row.totalSteps} steps done</p>
          </div>
          <Link to={`/student/demo/${resume.row.module.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 font-semibold text-brand hover:bg-brand-tint">
            Continue lesson <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      )}

      <section aria-labelledby="topics-title" className="mb-8">
        <h2 id="topics-title" className="mb-4 text-xl">Topics</h2>
        {isLoading && <p role="status" className="mb-3 text-sm text-cic-muted">Loading your courses…</p>}
        {isError && <p role="alert" className="mb-3 text-sm text-danger">Could not load your courses. Try reloading.</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {topics.map((t, i) => (
            <TopicTile
              key={t.id}
              topic={t}
              text={progressText(t, rows[i], !!t.courseId && !!statuses[i]?.isLoading)}
              selected={i === selectedIndex}
              onSelect={() => select(t.id)}
            />
          ))}
        </div>
      </section>

      {selected && (
        <div className="mb-8">
          <LessonPath
            topic={selected}
            rows={rows[selectedIndex]}
            loading={!!selected.courseId && !!statuses[selectedIndex]?.isLoading}
            error={!!selected.courseId && !!statuses[selectedIndex]?.isError}
          />
        </div>
      )}

      <JoinClassCard studentId={studentId} onJoined={(id) => id && select(id)} />
    </>
  )
}
