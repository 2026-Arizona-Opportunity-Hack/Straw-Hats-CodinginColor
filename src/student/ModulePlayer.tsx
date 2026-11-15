// Owner: Jacky. Renders a module as one scrolling page of step cards.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { defaultUrlTransform } from 'react-markdown'
import { ArrowLeft, Check, ChevronDown, CircleCheck, CircleX } from 'lucide-react'
import { getModule, listActivityStatus, listMyCourses, recordAttempt, type ActivityStatus, type ModuleWithContent } from '../api/student/index.ts'
import { embedUrl } from '../instructor/model.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import type { Choice } from '../shared/types/activities.ts'
import type { Activity } from '../shared/types/db.ts'
import { isLocalDemo } from '../shared/supabase.ts'
import { ActivityCard, ProgressBar } from '../shared/ui/ActivityCard.tsx'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import { InlineText, LessonMarkdown } from '../shared/ui/LessonMarkdown.tsx'
import { activityKind, activityKinds, leadingHeading, readMinutes } from '../shared/ui/lessonContent.ts'
import { Button } from '../shared/ui/index.tsx'

type Field = { id: string; prompt: string; choices?: Choice[] }
/** What the server said about the one choice a student picked, when it says anything. */
type Feedback = { choiceId: string; correct: boolean }

/** A step's title: the authored title, else a leading Markdown heading, else the step type. */
function stepTitle(activity: Activity) {
  const content = activity.content as { title?: unknown; markdown?: unknown }
  if (typeof content.title === 'string' && content.title.trim()) return content.title.trim()
  if (activity.type === 'content' && typeof content.markdown === 'string') {
    const heading = leadingHeading(content.markdown)
    if (heading) return heading
  }
  return activityKinds[activityKind(activity.type)].title
}

const markdownOf = (activity: Activity) => activity.type === 'content' ? (activity as Activity<'content'>).content.markdown ?? '' : ''

function AnswerField({ id, prompt, choices, count, feedback }: Field & { count?: string; feedback?: Feedback | null }) {
  const counter = count && <span className="cic-question-count">{count}</span>
  return choices?.length ? (
    <fieldset className="cic-question">
      <legend className="cic-question-prompt">{counter}<InlineText text={prompt} /></legend>
      <div className="cic-options">
        {choices.map(choice => {
          const result = feedback?.choiceId === choice.id ? (feedback.correct ? 'correct' : 'incorrect') : undefined
          return <label key={choice.id} className="cic-option" data-result={result}>
            <input type="radio" name={id} value={choice.id} required />
            <span className="cic-option-text"><InlineText text={choice.label} /></span>
            {result && <span className="cic-option-result">{result === 'correct'
              ? <><CircleCheck aria-hidden="true" size={18} />Correct</>
              : <><CircleX aria-hidden="true" size={18} />Not quite</>}</span>}
          </label>
        })}
      </div>
    </fieldset>
  ) : (
    <label className="cic-answer">{counter}<span><InlineText text={prompt} /></span>
      <textarea className="cic-textarea" name={id} rows={4} maxLength={2000} required />
    </label>
  )
}

function ActivityBlock({ activity, status, step, total, done: alreadyDone, onSaved }: {
  activity: Activity; status?: ActivityStatus; step: number; total: number; done: boolean; onSaved: (activityId: string) => void
}) {
  const [started, setStarted] = useState(() => performance.now())
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const formId = useId()
  const attempt = useMutation({
    mutationFn: ({ response, score }: { response: unknown; score?: number }) => recordAttempt({
      activity_id: activity.id, response, client_score: score, time_on_task_ms: Math.round(performance.now() - started),
    }),
    onSuccess: () => { setStarted(performance.now()); onSaved(activity.id) },
  })
  const done = attempt.isSuccess || alreadyDone
  const score = attempt.data ? attempt.data.score : status?.best_score
  const title = stepTitle(activity)
  const submit = (response: unknown = {}, score?: number, choiceId?: string) => attempt.mutate({ response, score }, {
    onSuccess: result => { if (choiceId && typeof result?.is_correct === 'boolean') setFeedback({ choiceId, correct: result.is_correct }) },
  })
  const complete = <div className="cic-actions"><Button type="button" disabled={attempt.isPending} onClick={() => submit()}>Mark as done</Button></div>
  const responseForm = (fields: Field[], key?: string) => {
    if (!fields.length) return <><p className="cic-note">No questions were added to this activity.</p>{!done && complete}</>
    function send(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const answers = Object.fromEntries(fields.map(field => [field.id, String(data.get(formId + field.id) ?? '').trim()]))
      // Only a single multiple-choice question maps the server's is_correct onto one option.
      const choiceId = fields.length === 1 && fields[0].choices?.length ? answers[fields[0].id] : undefined
      submit(key ? { [key]: answers } : answers, undefined, choiceId)
    }
    return <form className="cic-card-body" onSubmit={send} onChange={() => setFeedback(null)}>
      <div>{fields.map((field, index) => <AnswerField key={field.id} {...field} id={formId + field.id}
        count={fields.length > 1 ? `Question ${index + 1} of ${fields.length}` : undefined} feedback={feedback} />)}</div>
      <div className="cic-actions"><Button type="submit" disabled={attempt.isPending}>Submit answer{fields.length > 1 ? 's' : ''}</Button></div>
    </form>
  }

  function body() {
    switch (activity.type) {
      case 'interactive_html': {
        const { html, instructions, reports_score } = (activity as Activity<'interactive_html'>).content
        return <>
          {instructions && <p className="cic-lead">{instructions}</p>}
          <InteractiveHtmlFrame html={html} allowScripts={isLocalDemo} title={title} device
            onComplete={reports_score && !done && !attempt.isPending ? score => submit({}, score) : undefined} />
          {!done && (!reports_score || !isLocalDemo) && complete}
        </>
      }
      case 'check':
      case 'exit': {
        const { prompt, choices } = (activity as Activity<'check' | 'exit'>).content
        return responseForm([{ id: choices?.length ? 'choice_id' : 'text', prompt, choices }])
      }
      case 'pretest':
      case 'posttest':
        return responseForm((activity as Activity<'pretest' | 'posttest'>).content.items ?? [], 'answers')
      case 'worksheet':
        return responseForm(((activity as Activity<'worksheet'>).content.fields ?? []).map(field => ({
          id: field.id, prompt: field.prompt, choices: field.kind === 'multiple_choice' ? field.choices : undefined,
        })), 'fields')
      case 'video': {
        const { url, caption } = (activity as Activity<'video'>).content
        const embed = embedUrl(url)
        return <>
          {embed && <div className="cic-video"><iframe src={embed} title={caption || title} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>}
          <p className="cic-lead">{embed && caption && <>{caption} · </>}<a className="cic-md-a" href={defaultUrlTransform(url)} target="_blank" rel="noreferrer">
            {embed ? 'Open the video in a new tab' : caption || 'Open video'}</a></p>
          {!done && complete}
        </>
      }
      case 'content':
        return <><LessonMarkdown markdown={markdownOf(activity)} title={title} />{!done && complete}</>
      case 'code': {
        const { starter_code, prompt } = (activity as Activity<'code'>).content
        return <>{starter_code && <pre className="cic-code"><code>{starter_code}</code></pre>}
          {responseForm([{ id: 'code', prompt: prompt || 'Write your code' }])}</>
      }
      default:
        return <><p className="cic-note">These materials are not available in the player yet.</p>{!done && complete}</>
    }
  }

  const kind = activityKind(activity.type)
  return <ActivityCard id={'step-' + activity.id} kind={kind} title={title} step={step} total={total} done={done}
    minutes={kind === 'read' ? readMinutes(markdownOf(activity)) : undefined}>
    {body()}
    {attempt.isPending && <p role="status" className="cic-note">Saving…</p>}
    {attempt.isError && <p role="alert" className="cic-error">Could not save your work. Try again.</p>}
    <p role="status" className="cic-complete">{done && <>
      <CircleCheck aria-hidden="true" size={20} />{score == null ? 'Completed' : `Completed · ${Math.round(score * 100)}%`}
    </>}</p>
  </ActivityCard>
}

function Outline({ mod, isDone, onPick }: { mod: ModuleWithContent; isDone: (id: string) => boolean; onPick: () => void }) {
  function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const card = document.getElementById('step-' + id)
    if (!card) return
    event.preventDefault()
    onPick()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    const heading = card.querySelector<HTMLElement>('.cic-card-title')
    heading?.setAttribute('tabindex', '-1')
    heading?.focus({ preventScroll: true })
  }
  return <ol className="cic-outline">{mod.lessons.map(lesson => <li key={lesson.id} className="cic-outline-lesson">
    <p>{lesson.title}</p>
    <ol>{lesson.activities.map((activity, index) => {
      const done = isDone(activity.id)
      return <li key={activity.id}><a href={'#step-' + activity.id} data-done={done || undefined} onClick={event => jump(event, activity.id)}>
        <span className="cic-outline-mark" aria-hidden="true">{done ? <Check size={13} strokeWidth={3} /> : index + 1}</span>
        <span>{stepTitle(activity)}{done && <span className="cic-sr-only"> (done)</span>}</span>
      </a></li>
    })}</ol>
  </li>)}</ol>
}

export function ModulePlayer() {
  const { moduleId = '' } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const studentId = profile?.id
  const [finished, setFinished] = useState<ReadonlySet<string>>(() => new Set())
  const [outlineOpen, setOutlineOpen] = useState(false)
  const { data: mod, isLoading, isError } = useQuery({
    queryKey: ['module', studentId, moduleId], queryFn: () => getModule(moduleId),
  })
  const activityKey = ['moduleActivities', studentId, moduleId]
  const { data: progress = [], isLoading: progressLoading, isError: progressError } = useQuery({
    queryKey: activityKey, queryFn: () => listActivityStatus(moduleId), enabled: !!mod,
  })
  // Same query as the course list, so the course name is usually already cached.
  const { data: courses = [] } = useQuery({ queryKey: ['myCourses', studentId], queryFn: listMyCourses, enabled: !!mod })

  if (isLoading || (mod && progressLoading)) return <p role="status">Loading lesson…</p>
  if (isError || progressError) return <p role="alert">Could not load this module. Try reloading the page.</p>
  if (!mod) return <p>This module is unavailable. <Link className="underline" to="/student">Back to my courses</Link></p>

  function refreshProgress(activityId: string) {
    setFinished(previous => new Set(previous).add(activityId))
    void queryClient.invalidateQueries({ queryKey: activityKey })
    void queryClient.invalidateQueries({ queryKey: ['moduleStatus', studentId, mod?.course_id] })
  }
  const statuses = new Map(progress.map(status => [status.activity_id, status]))
  const isDone = (id: string) => finished.has(id) || !!statuses.get(id)?.submitted
  const activities = mod.lessons.flatMap(lesson => lesson.activities)
  const doneCount = activities.filter(activity => isDone(activity.id)).length
  const reading = activities.reduce((sum, activity) => sum + (activity.type === 'content' ? readMinutes(markdownOf(activity)) : 0), 0)
  const course = courses.find(item => item.id === mod.course_id)
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

  return <>
    <header className="cic-module-head">
      <Link className="cic-back" to="/student"><ArrowLeft aria-hidden="true" size={16} />My courses</Link>
      <p className="cic-eyebrow">{[course?.title, `Module ${mod.position}`].filter(Boolean).join(' · ')}</p>
      <h1 className="cic-module-title">{mod.title}</h1>
      <p className="cic-lesson-meta">
        {[plural(mod.lessons.length, 'lesson'), plural(activities.length, 'step'), reading ? `about ${reading} min of reading` : ''].filter(Boolean).join(' · ')}
      </p>
      <ProgressBar done={doneCount} total={activities.length} label="Module progress" />
    </header>
    <div className="cic-player">
      <details className="cic-outline-toggle" open={outlineOpen} onToggle={event => setOutlineOpen(event.currentTarget.open)}>
        <summary>Module outline<ChevronDown aria-hidden="true" size={20} /></summary>
        <nav aria-label="Module outline"><Outline mod={mod} isDone={isDone} onPick={() => setOutlineOpen(false)} /></nav>
      </details>
      <nav className="cic-outline-wide" aria-labelledby="module-outline-title">
        <h2 id="module-outline-title">In this module</h2>
        <Outline mod={mod} isDone={isDone} onPick={() => {}} />
      </nav>
      <div className="cic-player-main">
        {mod.lessons.map((lesson, index) => {
          const lessonDone = lesson.activities.filter(activity => isDone(activity.id)).length
          return <section key={lesson.id} className="cic-lesson" aria-labelledby={'lesson-' + lesson.id}>
            <header className="cic-lesson-head">
              <p className="cic-eyebrow">Lesson {index + 1} of {mod.lessons.length}</p>
              <h2 className="cic-lesson-title" id={'lesson-' + lesson.id}>{lesson.title}</h2>
              {lesson.activities.length > 0 && <ProgressBar done={lessonDone} total={lesson.activities.length} label={lesson.title + ' progress'} />}
            </header>
            {lesson.activities.map((activity, step) => <ActivityBlock key={activity.id} activity={activity} status={statuses.get(activity.id)}
              step={step + 1} total={lesson.activities.length} done={isDone(activity.id)} onSaved={refreshProgress} />)}
            {!lesson.activities.length && <p className="cic-note">This lesson has no steps yet.</p>}
          </section>
        })}
      </div>
    </div>
  </>
}
