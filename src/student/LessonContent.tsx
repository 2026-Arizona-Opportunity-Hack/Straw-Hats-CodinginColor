import { useMutation } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import type { ActivityStatus, AttemptInput, recordAttempt } from '../api/student/index.ts'
import { slidesUrl } from '../instructor/model.ts'
import type { Choice } from '../shared/types/activities.ts'
import type { Activity, Lesson } from '../shared/types/db.ts'
import { curriculumUrl } from '../shared/ui/curriculumUrl.ts'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import { Button, Card } from '../shared/ui/index.tsx'
import './lessonContent.css'

export type SubmitActivity = (input: AttemptInput) => ReturnType<typeof recordAttempt>

type ActivityProps = {
  activity: Activity
  status?: ActivityStatus
  onAttempt: SubmitActivity
  onSaved?: () => void
  allowScripts?: boolean
}

function useActivityAttempt(activityId: string, onAttempt: SubmitActivity, onSaved?: () => void) {
  const [started, setStarted] = useState(() => performance.now())
  return useMutation({
    mutationFn: ({ response, score }: { response: unknown; score?: number }) => onAttempt({
      activity_id: activityId, response, client_score: score, time_on_task_ms: Math.round(performance.now() - started),
    }),
    onSuccess: () => { setStarted(performance.now()); onSaved?.() },
  })
}

function AnswerField({ id, prompt, choices }: { id: string; prompt: string; choices?: Choice[] }) {
  return choices?.length ? (
    <fieldset className="space-y-1">
      <legend className="font-medium">{prompt}</legend>
      {choices.map(choice => <label key={choice.id} className="cic-lesson-choice">
        <input type="radio" name={id} value={choice.id} required />{choice.label}
      </label>)}
    </fieldset>
  ) : (
    <label className="block font-medium">{prompt}
      <textarea className="block w-full rounded-md border border-divider p-2 font-normal" name={id} rows={3} maxLength={2000} required />
    </label>
  )
}

function KnowledgeCheck({ activityId, prompt, choices, status, onAttempt, onSaved }: {
  activityId: string
  prompt: string
  choices: Choice[]
  status?: ActivityStatus
  onAttempt: SubmitActivity
  onSaved?: () => void
}) {
  const [selected, setSelected] = useState<string>()
  const checking = useRef(false)
  const attempt = useActivityAttempt(activityId, onAttempt, onSaved)

  function choose(choiceId: string) {
    if (checking.current || (choiceId === selected && attempt.isSuccess)) return
    checking.current = true
    setSelected(choiceId)
    attempt.mutate({ response: { choice_id: choiceId } }, {
      onSettled: () => { checking.current = false },
    })
  }

  let feedback = status?.submitted && status.best_score === 1
    ? 'You answered correctly.' : 'Choose an answer to check your work.'
  if (attempt.isPending) feedback = 'Checking your answer…'
  if (attempt.isSuccess) {
    if (attempt.data.is_correct === true) feedback = 'Correct!'
    else if (attempt.data.is_correct === false) feedback = 'Incorrect. Try another answer.'
    else feedback = 'Answer saved.'
  }

  return <div className="space-y-2">
    <fieldset aria-busy={attempt.isPending}>
      <legend className="font-medium">{prompt}</legend>
      <div className="mt-2 grid gap-2">
        {choices.map(choice => <Button key={choice.id} variant="secondary"
          className="w-full justify-start text-left aria-pressed:bg-brand-tint"
          aria-pressed={choice.id === selected}
          aria-disabled={attempt.isPending || (choice.id === selected && attempt.isSuccess)}
          onClick={() => choose(choice.id)}>{choice.label}</Button>)}
      </div>
    </fieldset>
    <p role="status" className={attempt.data?.is_correct === false ? 'text-warn' : 'text-brand'}>
      {attempt.isError ? '' : feedback}
    </p>
    {attempt.isError && <p role="alert">Could not save your answer. Choose an answer again to retry.</p>}
  </div>
}

function ActivityForm({ activity, status, onAttempt, onSaved, allowScripts = false }: ActivityProps) {
  const formId = useId()
  const attempt = useActivityAttempt(activity.id, onAttempt, onSaved)
  const done = attempt.isSuccess || status?.submitted
  const score = attempt.data ? attempt.data.score : status?.best_score
  const submit = (response: unknown = {}, score?: number) => attempt.mutate({ response, score })
  const complete = <Button type="button" disabled={attempt.isPending} onClick={() => submit()}>Mark as done</Button>
  const responseForm = (fields: { id: string; prompt: string; choices?: Choice[] }[], key?: string) => {
    if (!fields.length) return <><p>No questions were added to this activity.</p>{!done && complete}</>
    function send(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const answers = Object.fromEntries(fields.map(field => [field.id, String(data.get(formId + field.id) ?? '').trim()]))
      submit(key ? { [key]: answers } : answers)
    }
    return <form className="space-y-3" onSubmit={send}>
      {fields.map(field => <AnswerField key={field.id} {...field} id={formId + field.id} />)}
      <Button type="submit" disabled={attempt.isPending}>Submit answer{fields.length > 1 ? 's' : ''}</Button>
    </form>
  }

  function body() {
    switch (activity.type) {
      case 'interactive_html': {
        const { html, instructions, reports_score } = (activity as Activity<'interactive_html'>).content
        return <>
          {instructions && <p>{instructions}</p>}
          <InteractiveHtmlFrame html={html} allowScripts={allowScripts} title={activity.concept}
            onComplete={reports_score && !done && !attempt.isPending ? score => submit({}, score) : undefined} />
          {!done && (!reports_score || !allowScripts) && complete}
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
        return <><p><a className="underline" href={defaultUrlTransform(url)} target="_blank" rel="noreferrer">{caption || 'Open video'}</a></p>{!done && complete}</>
      }
      case 'slides': {
        const { url, caption } = (activity as Activity<'slides'>).content
        const embed = slidesUrl(url)
        return <>{embed && <iframe className="aspect-video w-full rounded-lg border border-divider" src={embed}
          title={caption || 'Slide deck'} loading="lazy" allowFullScreen />}{!done && complete}</>
      }
      case 'content':
        return !done && complete
      case 'code': {
        const { starter_code, prompt } = (activity as Activity<'code'>).content
        return <>{starter_code && <pre className="overflow-auto"><code>{starter_code}</code></pre>}
          {responseForm([{ id: 'code', prompt: prompt || 'Write your code' }])}</>
      }
      default:
        return <><p>These materials are not available in the player yet.</p>{!done && complete}</>
    }
  }

  return <>
    {body()}
    {attempt.isPending && <p role="status">Saving…</p>}
    {attempt.isError && <p role="alert">Could not save your work. Try again.</p>}
    {done && <p role="status" className="text-green-800">{score == null ? 'Completed' : `Completed · ${Math.round(score * 100)}%`}</p>}
  </>
}

export function ActivityBlock(props: ActivityProps) {
  const { activity, status, onAttempt, onSaved } = props
  const { content } = activity
  const title = 'title' in content && typeof content.title === 'string' ? content.title : null
  const markdown = activity.type !== 'code' && 'markdown' in content && typeof content.markdown === 'string' ? content.markdown : null
  const check = activity.type === 'check' ? (activity as Activity<'check'>).content : null

  return <div className="min-w-0 space-y-3">
    {title && <h3 className="text-base font-semibold text-brand">{title}</h3>}
    {markdown && <Markdown skipHtml urlTransform={curriculumUrl}>{markdown}</Markdown>}
    {check?.choices?.length
      ? <KnowledgeCheck activityId={activity.id} prompt={check.prompt} choices={check.choices}
        status={status} onAttempt={onAttempt} onSaved={onSaved} />
      : <ActivityForm {...props} />}
  </div>
}

export function LessonContent({ lesson, statuses, onAttempt, onSaved, allowScripts }: {
  lesson: Lesson & { activities: Activity[] }
  statuses?: ReadonlyMap<string, ActivityStatus>
  onAttempt: (activity: Activity, input: AttemptInput) => ReturnType<SubmitActivity>
  onSaved?: () => void
  allowScripts?: boolean
}) {
  return <section className="space-y-3">
    <h2 className="text-xl">{lesson.title}</h2>
    {lesson.activities.map(activity => <Card key={activity.id}>
      <ActivityBlock activity={activity} status={statuses?.get(activity.id)} onAttempt={input => onAttempt(activity, input)}
        onSaved={onSaved} allowScripts={allowScripts} />
    </Card>)}
  </section>
}
