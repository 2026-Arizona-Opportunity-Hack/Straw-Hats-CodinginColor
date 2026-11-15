// Owner: Jacky. Student home: my courses, to do, my classroom, and the way into Explore.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { listModuleStatus, listMyCourses, type ModuleStatus, type StudentCourse } from '../api/student/index.ts'
import { joinClass } from '../api/student/auth.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { Button, FormStatus, Input } from '../shared/ui/index.tsx'
import { ALL_LANGUAGES, languageOf, type Language } from './languages.ts'
import { PublishedDemoList } from './PublishedDemo'
import { PlacementCard } from './placement/PlacementCard.tsx'
import './student.css'

const vars = (l: Language, extra: Record<string, string> = {}) => ({ '--hue': l.hue, '--tint': l.tint, ...extra }) as CSSProperties
const complete = (m: ModuleStatus) => m.state === 'completed'

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-12" aria-label={title}>
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-divider pb-3">
        <h2 className="st-serif text-3xl">{title}</h2>
        {note && <p className="text-sm text-cic-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Progress({ modules }: { modules?: ModuleStatus[] }) {
  if (!modules) return <p role="status" className="text-sm text-cic-muted">Loading progress…</p>
  if (!modules.length) return <p className="text-sm text-cic-muted">Modules appear here once your teacher releases them.</p>
  return (
    <div className="st-bar flex gap-1" role="img" aria-label={`${modules.filter(complete).length} of ${modules.length} modules complete`}>
      {modules.map((m) => <i key={m.module_id} className={m.tested_out ? 'skipped' : complete(m) ? 'done' : m.state === 'available' ? 'open' : ''} />)}
    </div>
  )
}

/** The module to open next: the first one open, else the last one finished (to review). */
const nextModule = (modules?: ModuleStatus[]) => modules?.find((m) => m.state === 'available') ?? modules?.findLast(complete)

function CourseCard({ course, modules }: { course: StudentCourse; modules?: ModuleStatus[] }) {
  const lang = languageOf(course.title)
  const next = nextModule(modules)
  const done = modules?.filter(complete).length ?? 0
  return (
    <Link to={`/student/course/${course.id}`} className="st-soft flex flex-col overflow-hidden rounded-2xl bg-white transition hover:-translate-y-0.5" style={vars(lang)}>
      <div className="st-cover h-36" style={{ '--logo': '76px' } as CSSProperties}>
        <img src={lang.logo} alt="" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold" style={{ color: lang.hue }}>{lang.key}</span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h3 className="st-serif text-2xl leading-tight">{course.title}</h3>
          <p className="mt-1 text-sm text-cic-muted">{course.class_name ?? 'On my own'}</p>
        </div>
        <Progress modules={modules} />
        <div className="mt-auto flex items-center justify-between text-sm text-cic-muted">
          <span><strong className="text-black">{done}</strong> of {modules?.length ?? '…'} modules</span>
          {next && <span className="font-semibold" style={{ color: lang.hue }}>{next.state === 'available' ? 'Continue' : 'Review'} →</span>}
        </div>
      </div>
    </Link>
  )
}

interface Task { key: string; title: string; detail: string; chip: string; tone: 'go' | 'fast' | 'warn' | 'done'; to?: string; lang: Language }
const TONE = { go: 'bg-brand-tint text-brand', fast: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn', done: 'bg-canvas text-cic-muted' }

/** One task per course, from my_course_progress: warm-up to skip ahead, final-check tries, or the next module. */
function tasksFor(course: StudentCourse, modules?: ModuleStatus[]): Task[] {
  if (!modules?.length) return []
  const lang = languageOf(course.title)
  const open = modules.find((m) => m.state === 'available')
  if (!open) return modules.every(complete) ? [{ key: course.id, title: `${course.title} complete`, detail: 'Every module finished. Pick your next course in Explore.', chip: 'Done', tone: 'done', lang }] : []
  const base = { key: course.id, to: `/student/module/${open.module_id}`, lang }
  if (open.pretest_score == null) return [{ ...base, title: `Warm-up: ${open.title}`, detail: `${course.title} · pass it to skip this module`, chip: 'Skip ahead', tone: 'fast' }]
  const left = open.max_tries != null && open.posttest_tries ? open.max_tries - open.posttest_tries : null
  if (left != null && left > 0) return [{ ...base, title: `Final check: ${open.title}`, detail: `${course.title} · your best try counts`, chip: `${left} ${left === 1 ? 'try' : 'tries'} left`, tone: 'warn' }]
  return [{ ...base, title: `Continue: ${open.title}`, detail: course.title, chip: 'Next', tone: 'go' }]
}

function TodoPanel({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  return (
    <aside className="rounded-2xl bg-white p-5 lg:sticky lg:top-6" aria-labelledby="todo-h">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="todo-h" className="st-serif text-2xl">To do</h2>
        <span className="text-xs font-semibold uppercase tracking-widest text-cic-muted">{tasks.filter((t) => t.tone !== 'done').length} open</span>
      </div>
      {loading && <p role="status" className="py-3 text-sm text-cic-muted">Loading…</p>}
      {!loading && !tasks.length && <p className="py-3 text-sm text-cic-muted">Nothing due. Add a course in Explore to get started.</p>}
      <ul className="divide-y divide-divider">
        {tasks.map((t) => {
          const body = (
            <>
              <span className="st-tile size-10" style={vars(t.lang)}><img src={t.lang.logo} alt="" className="size-6" /></span>
              <span className="min-w-0"><span className="block font-semibold leading-snug">{t.title}</span><span className="block text-sm text-cic-muted">{t.detail}</span></span>
              <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[t.tone]}`}>{t.chip}</span>
            </>
          )
          const cls = 'grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3'
          return <li key={t.key}>{t.to ? <Link to={t.to} className={`${cls} rounded-lg hover:bg-canvas`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
        })}
      </ul>
    </aside>
  )
}

function ClassRow({ course, modules }: { course: StudentCourse; modules?: ModuleStatus[] }) {
  const lang = languageOf(course.title)
  const pct = modules?.length ? Math.round((modules.filter(complete).length / modules.length) * 100) : 0
  return (
    <li>
      <Link to={`/student/course/${course.id}`} className="flex items-center gap-4 rounded-2xl px-4 py-3 hover:bg-white" style={vars(lang)}>
        <span className="st-tile size-11" aria-hidden="true"><img src={lang.logo} alt="" className="size-7" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">{course.class_name}</span><span className="block text-sm text-cic-muted">{course.title}</span></span>
        <span className="text-sm font-semibold" style={{ color: lang.hue }}>{pct}%</span>
        <span aria-hidden="true" className="text-cic-muted">›</span>
      </Link>
    </li>
  )
}

function JoinClass() {
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const join = useMutation({
    mutationFn: () => joinClass(code.trim()),
    onSuccess: () => { setCode(''); return qc.invalidateQueries({ queryKey: ['myCourses'] }) },
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    if (code.trim()) join.mutate()
  }
  return (
    <form onSubmit={submit} className="flex flex-col justify-center rounded-2xl bg-white p-5">
      <label htmlFor="join-code" className="st-serif mb-1 text-2xl">Join a class</label>
      <p className="mb-3 text-sm text-cic-muted">Enter the code your teacher shared.</p>
      <div className="flex gap-2">
        <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. MARY-P3" autoComplete="off" spellCheck={false} className="min-w-0 flex-1 font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal" />
        <Button type="submit" disabled={join.isPending}>{join.isPending ? 'Joining…' : 'Join'}</Button>
      </div>
      <div className="mt-2"><FormStatus error={join.error?.message} success={join.data && `You joined ${join.data.class_name}.`} /></div>
    </form>
  )
}

function ExploreOrbit() {
  return (
    <div className="st-orbit">
      <div className="st-ring">
        {ALL_LANGUAGES.map((l, i) => (
          <div key={l.key} className="st-sat" style={{ '--a': `${(360 / ALL_LANGUAGES.length) * i - 90}deg` } as CSSProperties}>
            <Link to={`/student/explore?lang=${encodeURIComponent(l.key)}`} style={vars(l)} aria-label={`Explore ${l.key}`}>
              <img src={l.logo} alt="" /><span>{l.key}</span>
            </Link>
          </div>
        ))}
      </div>
      <Link to="/student/explore" className="st-core">
        <span className="st-serif text-3xl" style={{ color: 'inherit' }}>Explore</span>
        <span className="text-xs opacity-70">Every language</span>
      </Link>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className={`size-2.5 rounded-full ${tone}`} aria-hidden="true" />
      <div><dt className="text-xs text-cic-muted">{label}</dt><dd className="st-serif text-2xl leading-tight">{value}</dd></div>
    </div>
  )
}

export function StudentHome() {
  const { profile } = useAuth()
  const { state } = useLocation() as { state: { added?: string } | null }
  const [now] = useState(() => new Date())
  const { data: courses = [], isLoading, isError } = useQuery({ queryKey: ['myCourses', profile?.id], queryFn: listMyCourses })
  const progress = useQueries({
    queries: courses.map((c) => ({ queryKey: ['moduleStatus', profile?.id, c.id], queryFn: () => listModuleStatus(c.id) })),
  })
  const modulesOf = (id: string) => progress[courses.findIndex((c) => c.id === id)]?.data
  const all = progress.flatMap((p) => p.data ?? [])
  const gains = all.filter((m) => m.pretest_score != null && m.posttest_best != null).map((m) => (m.posttest_best! - m.pretest_score!) * 100)
  const avgGain = gains.length ? Math.round(gains.reduce((a, b) => a + b, 0) / gains.length) : null
  const tasks = courses.flatMap((c) => tasksFor(c, modulesOf(c.id)))
  const classes = courses.filter((c) => c.source === 'class')
  const hour = now.getHours()

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cic-muted">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now)}</p>
          <h1 className="st-serif mt-2 text-4xl sm:text-5xl">Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {profile?.display_name.split(' ')[0]}.</h1>
        </div>
        <dl className="flex divide-x divide-divider rounded-2xl bg-white">
          <Stat label="Courses" value={String(courses.length)} tone="bg-[#6d4bd8]" />
          <Stat label="Modules complete" value={String(all.filter(complete).length)} tone="bg-info" />
          <Stat label="Average growth" value={avgGain == null ? '—' : `${avgGain >= 0 ? '+' : ''}${avgGain} pts`} tone="bg-brand" />
        </dl>
      </header>

      <PlacementCard />

      {state?.added && <p role="status" className="mt-6 rounded-xl bg-brand-tint px-4 py-3 font-semibold text-brand">{state.added} is now in your courses.</p>}

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="My courses">
          <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-divider pb-3">
            <h2 className="st-serif text-3xl">My courses</h2>
            <Link to="/student/explore" className="text-sm font-semibold text-brand hover:underline">+ Add a course</Link>
          </div>
          {isLoading && <p role="status">Loading your courses…</p>}
          {isError && <p role="alert">Could not load your courses. Try reloading.</p>}
          {!isLoading && !isError && !courses.length && (
            <p className="rounded-2xl border border-dashed border-cic-gray p-8 text-center text-cic-muted">No courses yet. Open Explore below to add one, or join your class.</p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            {courses.map((c) => <CourseCard key={c.id} course={c} modules={modulesOf(c.id)} />)}
          </div>
        </section>
        <TodoPanel tasks={tasks} loading={isLoading || progress.some((p) => p.isLoading)} />
      </div>

      <Section title="My classroom" note="Classes you joined with a code">
        <div className="grid items-start gap-5 md:grid-cols-2">
          <JoinClass />
          {classes.length > 0 && <ul className="divide-y divide-divider rounded-2xl bg-white/60">{classes.map((c) => <ClassRow key={c.id} course={c} modules={modulesOf(c.id)} />)}</ul>}
        </div>
      </Section>

      <Section title="Explore" note="Every language CIC teaches">
        <ExploreOrbit />
      </Section>

      <PublishedDemoList />
    </>
  )
}
