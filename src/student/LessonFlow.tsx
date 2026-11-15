// Owner: Jacky. Plays a lesson an instructor published, one step per screen (CodeHS / code.org style):
// step tracker, Back / Continue, resume where you left off, and a finish screen that opens the next lesson.
import {
  ArrowLeft, ArrowRight, BookOpen, Lock, CheckCircle2, ClipboardList, Code2, Flag, HelpCircle, MonitorPlay,
  MousePointerClick, PenLine, Presentation, Trophy, type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import { Link, useNavigate } from 'react-router-dom'
import { HtmlActivityPreview } from '../instructor/HtmlActivity.tsx'
import { labPayload } from '../instructor/labPayload.ts'
import { embedUrl, slidesUrl, type Activity, type ActivityType } from '../instructor/model.ts'
import '../instructor/styles.css'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { CodeLab } from '../shared/labs/CodeLab.tsx'
import { isLocalDemo } from '../shared/supabase.ts'
import { Badge, Button, EmptyState } from '../shared/ui/index.tsx'
import { findModule, lessonRows, loadProgress, saveProgress, stepsOf, type ModuleProgress } from './instructorContent.ts'
import { QuestionStep } from './QuestionStep.tsx'
import { topicIdForCourse } from './topics.ts'
import './lesson.css'

const STEP: Record<ActivityType, { label: string; icon: LucideIcon }> = {
  content: { label: 'Read', icon: BookOpen },
  video: { label: 'Watch', icon: MonitorPlay },
  slides: { label: 'Slides', icon: Presentation },
  interactive_html: { label: 'Try it', icon: MousePointerClick },
  check: { label: 'Quick check', icon: HelpCircle },
  worksheet: { label: 'Worksheet', icon: PenLine },
  code: { label: 'Code', icon: Code2 },
  exit: { label: 'Exit ticket', icon: Flag },
  pretest: { label: 'Warm-up quiz', icon: ClipboardList },
  posttest: { label: 'Final check', icon: Trophy },
}

const QUESTION_TYPES: ActivityType[] = ['check', 'worksheet', 'exit', 'pretest', 'posttest']
/** Steps the student must answer before Continue. Labs and widgets can be skipped (the runner may be offline). */
const mustAnswer = (a: Activity) => QUESTION_TYPES.includes(a.type) && a.questions.some((q) => q.prompt.trim())

function safeUrl(url: string, attr: string) {
  if (attr === 'src' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url)) return url
  return defaultUrlTransform(url)
}

function Prose({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null
  return (
    <div className="lesson-prose">
      <Markdown skipHtml urlTransform={safeUrl} components={{ h1: 'h3', h2: 'h3', img: (p) => <img src={p.src} alt={p.alt || ''} loading="lazy" /> }}>
        {markdown}
      </Markdown>
    </div>
  )
}

function StepBody({ activity, done, storageKey, onDone }: {
  activity: Activity
  done: boolean
  storageKey: string
  onDone: (score?: number | null) => void
}) {
  const embed = activity.type === 'video' ? embedUrl(activity.url) : activity.type === 'slides' ? slidesUrl(activity.url) : null

  if (mustAnswer(activity)) {
    return <><Prose markdown={activity.markdown} /><QuestionStep activity={activity} done={done} onDone={onDone} /></>
  }
  if (activity.type === 'code') {
    return (
      <>
        <Prose markdown={activity.markdown} />
        <CodeLab payload={{ ...labPayload(activity), prompt: '' }} storageKey={storageKey} enabled={isLocalDemo} onSubmitted={() => onDone(null)} />
      </>
    )
  }
  if (activity.type === 'interactive_html' && activity.interactiveHtml) {
    return (
      <>
        <Prose markdown={activity.markdown} />
        <div className="ic-app ic-embedded">
          <HtmlActivityPreview activity={activity.interactiveHtml} title={activity.title || 'Activity'} scripts={isLocalDemo} onComplete={(s) => onDone(s ?? null)} completed={done} />
        </div>
      </>
    )
  }
  return (
    <>
      <Prose markdown={activity.markdown} />
      {embed && (
        <div className="aspect-video overflow-hidden rounded-xl border border-divider bg-black">
          <iframe src={embed} title={activity.title || STEP[activity.type].label} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="size-full" />
        </div>
      )}
      {(activity.type === 'video' || activity.type === 'slides') && !embed && activity.url && (
        <p><a href={defaultUrlTransform(activity.url)} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">Open the {activity.type === 'video' ? 'video' : 'slides'} in a new tab</a></p>
      )}
    </>
  )
}

/** Render with key={moduleId} so opening another lesson starts from that lesson's saved progress. */
export function LessonFlow({ moduleId }: { moduleId: string }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const found = useMemo(() => findModule(moduleId), [moduleId])
  const steps = useMemo(() => (found ? stepsOf(found.module) : []), [found])
  const studentId = profile?.id ?? 'guest'

  const [progress, setProgress] = useState<ModuleProgress>(() => loadProgress(studentId, moduleId))
  const index = Math.min(progress.step, steps.length) // steps.length = finish screen
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(index)

  // New step: back to the top, keyboard focus on its title (skip on first load).
  useEffect(() => {
    if (shownStep.current === index) return
    shownStep.current = index
    window.scrollTo({ top: 0, behavior: 'smooth' })
    headingRef.current?.focus({ preventScroll: true })
  }, [index])

  function update(change: (p: ModuleProgress) => ModuleProgress) {
    setProgress((prev) => {
      const next = change(prev)
      saveProgress(studentId, moduleId, next)
      return next
    })
  }

  if (!found) {
    return <EmptyState title="This lesson isn’t available" description="Your teacher may have unpublished it." action={<Link to="/student" className="font-semibold text-brand underline">Back to topics</Link>} />
  }
  const { course, module, next } = found
  const backTo = `/student?topic=${topicIdForCourse(course.id)}`
  const rows = lessonRows(studentId, course)
  const position = rows.findIndex((r) => r.module.id === module.id)
  if (rows[position]?.state === 'locked') {
    const before = rows[position - 1].module
    return <EmptyState icon={<Lock />} title="This lesson is locked" description={`Finish ${before.title} first to unlock it.`}
      action={<Link to={`/student/demo/${before.id}`} className="font-semibold text-brand underline">Go to {before.title}</Link>} />
  }
  if (steps.length === 0) return <EmptyState title="This lesson is empty" description="Your teacher hasn’t added activities yet." action={<Link to={backTo} className="font-semibold text-brand underline">Back to {course.title}</Link>} />

  const isDone = (id: string) => progress.done.includes(id)
  const markDone = (id: string, score?: number | null) => update((p) => ({
    ...p,
    done: p.done.includes(id) ? p.done : [...p.done, id],
    scores: score != null && !(id in p.scores) ? { ...p.scores, [id]: score } : p.scores,
  }))
  const goTo = (i: number) => update((p) => ({ ...p, step: i }))
  const finished = index >= steps.length
  const furthest = Math.max(index, ...steps.map((s, i) => (isDone(s.activity.id) ? i + 1 : 0)))

  // ---- Finish screen -------------------------------------------------------------
  if (finished) {
    const skipped = steps.map((s, i) => ({ ...s, i })).filter((s) => !isDone(s.activity.id) && (mustAnswer(s.activity) || ['code', 'interactive_html'].includes(s.activity.type)))
    const graded = Object.values(progress.scores)
    const avg = graded.length ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 100) : null
    return (
      <div className="mx-auto max-w-2xl">
        <div className="soft-card flex flex-col items-center gap-3 rounded-2xl border border-divider bg-white px-6 py-10 text-center">
          <span aria-hidden="true" className="brand-panel grid size-20 place-items-center rounded-full text-white"><Trophy className="size-10" /></span>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl focus:outline-none">You finished {module.title}!</h1>
          <p className="text-cic-muted">{course.title}</p>
          <dl className="mt-2 grid w-full max-w-sm grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-tint p-3"><dt className="text-sm text-cic-muted">Steps done</dt><dd className="text-2xl font-bold text-brand">{steps.filter((s) => isDone(s.activity.id)).length} of {steps.length}</dd></div>
            <div className="rounded-xl bg-brand-tint p-3"><dt className="text-sm text-cic-muted">First-try score</dt><dd className="text-2xl font-bold text-brand">{avg == null ? '—' : `${avg}%`}</dd></div>
          </dl>
          {skipped.length > 0 && (
            <div className="mt-2 w-full rounded-xl border border-warn bg-warn-soft p-4 text-left text-sm">
              <p className="mb-2 font-semibold text-warn">You skipped {skipped.length === 1 ? 'a step' : `${skipped.length} steps`}. Go back any time:</p>
              <ul className="space-y-1">
                {skipped.map((s) => <li key={s.activity.id}><button type="button" onClick={() => goTo(s.i)} className="font-semibold text-brand underline">{s.activity.title || STEP[s.activity.type].label}</button></li>)}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {next
              ? <Button onClick={() => navigate(`/student/demo/${next.id}`)}>Next lesson: {next.title} <ArrowRight aria-hidden="true" /></Button>
              : <Badge tone="brand"><Flag aria-hidden="true" /> You finished every lesson in this course</Badge>}
            <Button variant="secondary" onClick={() => navigate(backTo)}>Back to {course.title}</Button>
          </div>
          <button type="button" onClick={() => goTo(0)} className="mt-2 text-sm font-semibold text-cic-muted underline">Review this lesson from the start</button>
        </div>
      </div>
    )
  }

  // ---- One step ------------------------------------------------------------------
  const { activity, lesson } = steps[index]
  const meta = STEP[activity.type]
  const done = isDone(activity.id)
  const blocked = mustAnswer(activity) && !done
  const skippable = !done && ['code', 'interactive_html'].includes(activity.type)
  const last = index === steps.length - 1

  function next_() {
    if (!mustAnswer(activity) && !['code', 'interactive_html'].includes(activity.type)) markDone(activity.id)
    if (last) update((p) => ({ ...p, step: steps.length, finished: true }))
    else goTo(index + 1)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> {course.title}
      </Link>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-cic-muted">{module.title}{module.lessons.length > 1 ? `: ${lesson.title}` : ''}</p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-cic-muted">Step {index + 1} of {steps.length}</p>
      </div>

      {/* Step tracker: icon + number + state, never color alone. Visited steps can be revisited. */}
      <nav aria-label="Lesson steps" className="mb-6">
        <ol className="flex gap-1.5 overflow-x-auto pb-1">
          {steps.map((s, i) => {
            const Icon = STEP[s.activity.type].icon
            const stepDone = isDone(s.activity.id)
            const current = i === index
            const reachable = i <= furthest
            return (
              <li key={s.activity.id} className="min-w-11 flex-1">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goTo(i)}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${s.activity.title || STEP[s.activity.type].label}${stepDone ? ', done' : ''}${!reachable ? ', not reached yet' : ''}`}
                  title={s.activity.title || STEP[s.activity.type].label}
                  className={`flex h-11 w-full items-center justify-center rounded-lg border-2 ${
                    current ? 'border-brand bg-white text-brand'
                      : stepDone ? 'border-brand bg-brand text-white'
                      : reachable ? 'border-divider bg-white text-cic-muted hover:border-brand-accent'
                      : 'border-transparent bg-divider text-cic-muted'
                  }`}
                >
                  {stepDone && !current ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <Icon aria-hidden="true" className="size-5" />}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <article className="soft-card rounded-2xl border border-divider bg-white p-5 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="brand"><meta.icon aria-hidden="true" /> {meta.label}</Badge>
          {done && <Badge tone="success"><CheckCircle2 aria-hidden="true" /> Done</Badge>}
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="mb-5 text-2xl focus:outline-none sm:text-3xl">{activity.title || meta.label}</h1>
        <div className="space-y-5">
          <StepBody
            key={activity.id}
            activity={activity}
            done={done}
            storageKey={['cic-learn.demo-attempt', studentId, module.id, module.revision ?? 1, activity.id, 'lab'].join(':')}
            onDone={(score) => markDone(activity.id, score)}
          />
        </div>
      </article>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-divider bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button variant="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>
          <ArrowLeft aria-hidden="true" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {blocked && <p className="hidden text-sm text-cic-muted sm:block">Answer to continue</p>}
          <Button variant={skippable ? 'secondary' : 'primary'} disabled={blocked} onClick={next_}>
            {skippable ? (last ? 'Skip and finish' : 'Skip for now') : last ? 'Finish lesson' : 'Continue'} <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
