// Owner: Jacky. Student home. A student in a class sees that class first; everyone can explore topics
// at their own pace below. Each topic opens its own course page (StudentCourse.tsx).
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, GraduationCap, Plus, School, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { joinClass } from '../api/student/auth.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { isLocalDemo, isMockMode } from '../shared/supabase.ts'
import { Badge, Button, Card, Field, FormStatus, Input } from '../shared/ui/index.tsx'
import {
  LEVEL_LABEL, isOpen, itemForClass, nextRow, progressText, useMyClasses, useStudentCatalog,
  type StudentClass, type ViewTopic,
} from './catalog.ts'
import { EXAMPLE_CLASS_CODE, joinLocalClass, resumeTarget } from './instructorContent.ts'

type Item = ReturnType<typeof useStudentCatalog>['items'][number]

function TopicTile({ topic, text }: { topic: ViewTopic; text: string }) {
  const open = isOpen(topic)
  return (
    <Link
      to={`/student/course/${topic.id}`}
      className="dot-hover soft-card flex h-full flex-col gap-3 rounded-2xl border-2 border-transparent bg-white p-4 hover:border-divider"
    >
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden="true" className={`grid h-12 min-w-12 place-items-center rounded-xl px-2 font-mono text-lg font-bold ${open ? 'brand-panel text-white' : 'bg-brand-tint text-brand'}`}>
          {topic.glyph}
        </span>
        <Badge tone={open ? 'brand' : 'neutral'}>{LEVEL_LABEL[topic.level]}</Badge>
      </div>
      <span className="text-lg font-bold leading-snug text-brand">{topic.title}</span>
      <span className="text-sm text-cic-muted">{topic.description}</span>
      <span className="mt-auto text-sm font-semibold">{text}</span>
    </Link>
  )
}

/** One class: who runs it, how far along the student is, and the next lesson to open. */
function ClassCard({ cls, item }: { cls: StudentClass; item?: Item }) {
  const rows = item?.rows ?? []
  const done = rows.filter((r) => r.state === 'completed').length
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0
  const next = nextRow(rows)
  return (
    <article className="soft-card flex flex-col gap-4 rounded-2xl border border-divider bg-white p-5 sm:flex-row sm:items-center">
      <span aria-hidden="true" className="brand-panel grid size-14 shrink-0 place-items-center rounded-2xl text-white"><School className="size-7" /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-xl">{cls.name}</h3>
        <p className="text-sm text-cic-muted">
          {[cls.teacher && `Teacher: ${cls.teacher}`, cls.school].filter(Boolean).join(' · ') || 'Your class'}
        </p>
        {item ? (
          <>
            <p className="mt-2 font-semibold">{item.topic.title}</p>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-2.5 max-w-64 flex-1 overflow-hidden rounded-full bg-divider" role="img" aria-label={`${done} of ${rows.length} lessons done`}>
                <div className="h-full rounded-full bg-brand-accent" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm tabular-nums text-cic-muted">{done} of {rows.length} lessons</span>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-cic-muted">Your teacher hasn’t published lessons for this class yet.</p>
        )}
      </div>
      {item && (
        <div className="flex flex-col gap-2 sm:items-end">
          {next ? (
            <Link to={next.href} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-dark">
              {next.state === 'in_progress' ? 'Continue' : 'Start'}: {next.title} <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : rows.length > 0 && <Badge tone="brand">All lessons done</Badge>}
          <Link to={`/student/course/${item.topic.id}`} className="text-sm font-semibold text-brand underline">See all lessons</Link>
        </div>
      )}
    </article>
  )
}

function JoinClassForm({ onJoined }: { onJoined?: () => void }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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
      let name: string
      if (isLocalDemo) {
        const studentName = (profile?.display_name ?? 'Student').replace(/\s*\(student\)$/i, '')
        name = joinLocalClass({ id: profile?.id ?? 'guest', name: studentName }, trimmed).name
      } else if (isMockMode) {
        // Hosted preview without a database: show the class for this visit only.
        name = `Class ${trimmed}`
        queryClient.setQueryData<StudentClass[]>(['myClasses', profile?.id], (prev = []) => [...prev, { id: `mock-${trimmed}`, name, school: '', teacher: null, courseId: '' }])
      } else {
        name = (await joinClass(trimmed)).class_name
      }
      setSuccess(`You joined ${name}.`)
      setCode('')
      if (!isMockMode || isLocalDemo) void queryClient.invalidateQueries({ queryKey: ['myClasses'] })
      void queryClient.invalidateQueries({ queryKey: ['myCourses'] })
      onJoined?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Field id="class-code" label="Class code" hint={`Try the example code ${EXAMPLE_CLASS_CODE}`}>
            <Input
              id="class-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`e.g. ${EXAMPLE_CLASS_CODE}`}
              autoComplete="off"
              aria-describedby="class-code-hint"
              className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy} className="sm:mb-[22px]">{busy ? 'Joining…' : 'Join class'}</Button>
      </form>
      <div className="mt-3"><FormStatus error={error} success={success} /></div>
    </>
  )
}

export function StudentHome() {
  const { profile } = useAuth()
  const firstName = profile?.display_name.split(' ')[0]
  const { studentId, items, isLoading, isError } = useStudentCatalog()
  const { data: classes = [], isLoading: classesLoading } = useMyClasses()
  const [showJoin, setShowJoin] = useState(false)
  const resume = isLocalDemo ? resumeTarget(studentId) : null
  const inClass = classes.length > 0
  // A class's own course shows in its class card, so "Explore on your own" lists everything else.
  const classTopics = new Set(classes.map((c) => itemForClass(c, items)?.topic.id).filter(Boolean))
  const explore = items.filter((it) => !classTopics.has(it.topic.id))

  const topics = (
    <section aria-labelledby="topics-title" className="mb-8">
      <h2 id="topics-title" className="text-xl">{inClass ? 'Explore on your own' : 'Topics'}</h2>
      <p className="mb-4 text-sm text-cic-muted">
        {inClass ? 'Optional lessons you can take at your own pace, outside your class.' : 'Open a topic to see its lessons. Learn at your own pace.'}
      </p>
      {isLoading && <p role="status" className="mb-3 text-sm text-cic-muted">Loading your courses…</p>}
      {isError && <p role="alert" className="mb-3 text-sm text-danger">Could not load your courses. Try reloading.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {explore.map(({ topic, rows, loading }) => <TopicTile key={topic.id} topic={topic} text={progressText(topic, rows, loading)} />)}
      </div>
    </section>
  )

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl tracking-tight sm:text-4xl">{firstName ? `Hi, ${firstName}` : 'Welcome'}</h1>
        <p className="mt-1 text-base text-cic-muted">
          {inClass ? 'Here’s what your class is working on.' : 'Pick a topic to start learning, or join your teacher’s class below.'}
        </p>
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

      {classesLoading && <p role="status" className="mb-6 text-sm text-cic-muted">Loading your classes…</p>}

      {inClass ? (
        <>
          <section aria-labelledby="classes-title" className="mb-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="classes-title" className="flex items-center gap-2 text-xl"><GraduationCap aria-hidden="true" className="size-5" /> My classes</h2>
              <Button size="sm" variant="ghost" aria-expanded={showJoin} aria-controls="join-another" onClick={() => setShowJoin((v) => !v)}>
                <Plus aria-hidden="true" /> Join another class
              </Button>
            </div>
            {showJoin && (
              <div id="join-another" className="soft-card mb-4 rounded-2xl border border-divider bg-white p-5">
                <JoinClassForm onJoined={() => setShowJoin(false)} />
              </div>
            )}
            <div className="space-y-4">
              {classes.map((cls) => <ClassCard key={cls.id} cls={cls} item={itemForClass(cls, items)} />)}
            </div>
          </section>
          {topics}
        </>
      ) : (
        <>
          {topics}
          <Card title="Join a class" description="Got a code from your teacher? Join their class to see the lessons they assign.">
            <p className="mb-4 flex items-center gap-2 text-cic-muted"><Users aria-hidden="true" className="size-5" /> You’re not in any classes yet.</p>
            <JoinClassForm />
          </Card>
        </>
      )}
    </>
  )
}
