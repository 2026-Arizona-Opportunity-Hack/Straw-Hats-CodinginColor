// Owner: Shivraj. Starter quiz: one question per screen, then a recommended first course.
// Records how long each answer takes and every change of answer; scoring runs in the
// database (submit_placement). No back button, so the timings stay honest.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { enrollInCourse } from '../../api/student/index.ts'
import {
  listPlacementItems, skipPlacement, submitPlacement,
  type PlacementAnswer, type PlacementItem, type PlacementResult, type RecommendedCourse,
} from '../../api/student/placement.ts'
import { useAuth } from '../../shared/auth/AuthContext.tsx'
import { Button, FormStatus } from '../../shared/ui/index.tsx'
import { languageOf } from '../languages.ts'
import '../student.css'

const RATING = ['Not really', 'A little', 'Curious', 'Very']
const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' }

type Value = PlacementAnswer['value']

function isAnswered(item: PlacementItem, value: Value) {
  if (item.kind === 'rating') return !!value && item.choices.every((c) => (value as Record<string, number>)[c.id])
  if (item.kind === 'multi') return Array.isArray(value) && value.length > 0
  return typeof value === 'string'
}

function Intro({ onStart, onSkip, skipping }: { onStart: () => void; onSkip: () => void; skipping: boolean }) {
  const { profile } = useAuth()
  return (
    <div className="st-banner mx-auto max-w-2xl px-6 py-14 text-center sm:px-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-white/80">Welcome{profile ? `, ${profile.display_name.split(' ')[0]}` : ''}</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ color: '#fff' }}>Let's find your first course</h1>
      <p className="mx-auto mt-3 max-w-md text-white/85">
        12 quick questions, about 5 minutes. It's not a test: "I haven't learned this yet" is a great answer.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={onStart} className="bg-white !text-brand hover:!bg-brand-tint">Start</Button>
        <Button variant="ghost" onClick={onSkip} disabled={skipping} className="!text-white hover:!bg-white/10">
          {skipping ? 'One moment…' : 'Skip for now'}
        </Button>
      </div>
    </div>
  )
}

function Question({ item, value, onChange }: { item: PlacementItem; value: Value; onChange: (v: Value, choice: string) => void }) {
  const name = `q-${item.id}`
  if (item.kind === 'rating') {
    const ratings = (value as Record<string, number>) ?? {}
    return (
      <div className="space-y-4">
        {item.choices.map((c) => (
          <fieldset key={c.id} className="rounded-2xl bg-white p-4">
            <legend className="sr-only">{c.label}</legend>
            <p aria-hidden="true" className="mb-3 font-semibold">{c.label}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATING.map((label, i) => (
                <label key={label} className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-divider px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
                  <input type="radio" className="sr-only" name={`${name}-${c.id}`} checked={ratings[c.id] === i + 1}
                    onChange={() => onChange({ ...ratings, [c.id]: i + 1 }, `${c.id}:${i + 1}`)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    )
  }
  const multi = item.kind === 'multi'
  const picked = multi ? ((value as string[]) ?? []) : []
  return (
    <div className="space-y-3">
      {item.code && <pre className="overflow-x-auto rounded-xl bg-[#14181a] p-4 font-mono text-sm leading-relaxed text-white"><code>{item.code}</code></pre>}
      {item.choices.map((c) => {
        const checked = multi ? picked.includes(c.id) : value === c.id
        return (
          <label key={c.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-divider bg-white px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
            <input type={multi ? 'checkbox' : 'radio'} name={name} checked={checked} className="size-4 accent-[var(--color-brand)]"
              onChange={() => {
                if (!multi) return onChange(c.id, c.id)
                const next = checked ? picked.filter((p) => p !== c.id)
                  : c.id === 'none' ? ['none'] : [...picked.filter((p) => p !== 'none'), c.id]
                onChange(next, c.id)
              }} />
            <span className={item.kind === 'knowledge' ? 'font-mono text-sm' : ''}>{c.label}</span>
          </label>
        )
      })}
    </div>
  )
}

function CourseCard({ course, primary }: { course: RecommendedCourse; primary?: boolean }) {
  const lang = languageOf(course.title)
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-4" style={{ '--hue': lang.hue, '--tint': lang.tint } as CSSProperties}>
      <span className={`st-tile ${primary ? 'size-16' : 'size-11'}`} aria-hidden="true"><img src={lang.logo} alt="" className={primary ? 'size-10' : 'size-7'} /></span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${primary ? 'text-xl' : ''}`}>{course.title}</span>
        <span className="block text-sm text-cic-muted">{LEVEL[course.level]} · {course.delivery_mode === 'self_paced' ? 'Self-paced' : 'With a class'}</span>
      </span>
    </div>
  )
}

export function QuizResult({ result }: { result: PlacementResult }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const course = result.course
  const start = useMutation({
    mutationFn: async () => {
      if (!course) return
      try { await enrollInCourse(course.id) } catch (e) {
        // Already in this course through a class: just open it.
        if (!(e instanceof Error) || !/already/i.test(e.message)) throw e
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['myCourses'] })
      if (course) navigate(`/student/course/${course.id}`)
    },
  })

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-widest text-cic-muted">Your starting point</p>
      <h1 className="st-serif mt-2 text-4xl">{LEVEL[result.level]} {result.subject === 'ai' ? 'AI explorer' : result.subject === 'web' ? 'web builder' : result.subject === 'python' ? 'Python coder' : 'coder'}</h1>

      {course ? (
        <section aria-labelledby="rec-h" className="mt-8 rounded-3xl bg-brand-tint p-5 sm:p-6">
          <h2 id="rec-h" className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">Recommended for you</h2>
          <CourseCard course={course} primary />
          <ul className="mt-4 space-y-1.5 text-sm">
            {result.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="text-brand">✓</span>{r}</li>)}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => start.mutate()} disabled={start.isPending}>{start.isPending ? 'Adding…' : 'Start this course'}</Button>
            <Link to="/student/explore" className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-brand hover:bg-white">Explore other courses</Link>
          </div>
          <div className="mt-3"><FormStatus error={start.error?.message} /></div>
        </section>
      ) : (
        <p className="mt-8 rounded-2xl bg-white p-5">No self-paced course is open yet. <Link className="font-semibold text-brand underline" to="/student/explore">Browse every course</Link> or join your class from home.</p>
      )}

      {result.alternatives.some((a) => a.course) && (
        <section aria-labelledby="alt-h" className="mt-8">
          <h2 id="alt-h" className="st-serif mb-3 text-2xl">Also a good fit</h2>
          <ul className="space-y-2">
            {result.alternatives.filter((a) => a.course).map((a) => (
              <li key={a.course!.id}><Link to={`/student/course/${a.course!.id}`} className="block rounded-2xl hover:ring-2 hover:ring-brand"><CourseCard course={a.course!} /></Link></li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-8 text-center"><Link to="/student" className="text-sm font-semibold text-cic-muted hover:text-black">Go to my home →</Link></p>
    </div>
  )
}

export function StarterQuiz() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { data: items = [], isLoading, isError } = useQuery({ queryKey: ['placementItems'], queryFn: listPlacementItems })
  const [step, setStep] = useState(-1) // -1 = intro
  const [value, setValue] = useState<Value>(undefined)
  const answers = useRef<Record<string, PlacementAnswer>>({})
  const events = useRef<PlacementAnswer['events']>([])
  const shownAt = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)

  // Move focus to each new question so screen readers announce it.
  useEffect(() => { if (step >= 0) heading.current?.focus() }, [step])

  // Refetch now, even though Home isn't mounted: invalidating alone left the old "never taken"
  // answer cached, so Home sent the student straight back here (skip needed two clicks).
  const done = () => qc.refetchQueries({ queryKey: ['placement', profile?.id], type: 'all' })
  const skip = useMutation({ mutationFn: skipPlacement, onSuccess: async () => { await done(); navigate('/student') } })
  const submit = useMutation({ mutationFn: () => submitPlacement(answers.current), onSuccess: done })

  function show(next: number) {
    setStep(next)
    setValue(undefined)
    events.current = []
    shownAt.current = performance.now()
  }

  function record(notYet = false) {
    const item = items[step]
    answers.current[item.id] = {
      ...(notYet ? { not_yet: true } : { value }),
      events: events.current,
      time_ms: Math.round(performance.now() - shownAt.current),
    }
    if (step + 1 < items.length) show(step + 1)
    else submit.mutate()
  }

  if (submit.data) return <QuizResult result={submit.data} />
  if (isLoading) return <p role="status">Loading…</p>
  if (isError || (!isLoading && !items.length)) {
    return <p role="alert">The starter quiz isn't available right now. <Link className="underline" to="/student">Go to my home</Link></p>
  }
  if (step < 0) return <Intro onStart={() => show(0)} onSkip={() => skip.mutate()} skipping={skip.isPending} />
  if (submit.isPending) return <p role="status" className="py-16 text-center text-lg">Finding your course…</p>

  const item = items[step]
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-divider" role="progressbar" aria-label="Quiz progress"
          aria-valuemin={1} aria-valuemax={items.length} aria-valuenow={step + 1}>
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / items.length) * 100}%` }} />
        </div>
        <span className="text-sm text-cic-muted">{step + 1} of {items.length}</span>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (isAnswered(item, value)) record() }}>
        <h1 className="st-serif mb-6 text-3xl outline-none" tabIndex={-1} ref={heading}>{item.prompt}</h1>
        <Question key={item.id} item={item} value={value}
          onChange={(v, choice) => { setValue(v); events.current.push({ choice, t: Math.round(performance.now() - shownAt.current) }) }} />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {item.kind === 'knowledge'
            ? <Button type="button" variant="ghost" onClick={() => record(true)}>I haven't learned this yet</Button>
            : <span />}
          <Button type="submit" disabled={!isAnswered(item, value)}>{step + 1 < items.length ? 'Next' : 'See my course'}</Button>
        </div>
        <div className="mt-3"><FormStatus error={submit.error?.message} /></div>
      </form>
    </div>
  )
}
