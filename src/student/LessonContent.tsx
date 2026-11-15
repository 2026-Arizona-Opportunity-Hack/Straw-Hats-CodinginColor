import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { defaultUrlTransform } from 'react-markdown'
import type { ActivityStatus, AttemptInput, recordAttempt } from '../api/student/index.ts'
import { embedUrl, slidesUrl } from '../instructor/model.ts'
import { CicArticle } from '../shared/curriculum/CicArticle.tsx'
import { CodeLab, type VerifyWebLab } from '../shared/labs/CodeLab.tsx'
import { previewCatPhotoChecks } from '../shared/labs/catPhoto.ts'
import type { Choice, DiscussionState } from '../shared/types/activities.ts'
import type { Activity, Lesson } from '../shared/types/db.ts'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import { LessonMarkdown } from '../shared/ui/LessonMarkdown.tsx'
import { Button, Card } from '../shared/ui/index.tsx'
import { DiscussionNotes } from './DiscussionNotes'
import './lessonContent.css'

export type SubmitActivity = (input: AttemptInput) => ReturnType<typeof recordAttempt>
type LoadDiscussion = (activityId: string) => Promise<DiscussionState>
const exampleNotes = [
  { id: 'example-1', answers: { f0: 'A school club could track points in a trivia game.' } },
  { id: 'example-2', answers: { f0: 'I would use one to count goals at soccer practice.' } },
]

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

/** Video links written into a reading ([text](https://youtube…)) play right on the card, under the text.
 * Only YouTube, Vimeo and Google Drive (the same embeds as video activities); other links stay links. */
function LinkedVideos({ markdown }: { markdown: string }) {
  const videos = [...markdown.matchAll(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g)]
    .map(([, label, url]) => ({ label, embed: embedUrl(url) }))
    .filter((v): v is { label: string; embed: string } => !!v.embed)
    .filter((v, i, all) => all.findIndex(o => o.embed === v.embed) === i)
  if (!videos.length) return null
  return <div className="space-y-4">
    {videos.map(v => <figure key={v.embed} className="space-y-1.5">
      <div className="cic-video"><iframe src={v.embed} title={v.label} allowFullScreen loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" /></div>
      <figcaption className="text-sm text-cic-muted">{v.label}</figcaption>
    </figure>)}
  </div>
}

export function ActivityBlock({ activity, status, onAttempt, onSaved, onResult, hideTitle = false, answerOnce = false, previousResponse,
  allowScripts = false, verifyLab, labStorageKey, loadDiscussion, studentId, demoDiscussion = false }: {
  activity: Activity; status?: ActivityStatus; onAttempt: SubmitActivity; onSaved?: () => void
  /** Called with each saved attempt's result, e.g. to celebrate a correct answer. */
  onResult?: (result: Awaited<ReturnType<SubmitActivity>>) => void
  /** The caller already shows the activity title (the one-card module player). */
  hideTitle?: boolean
  /** After the first submission, show the result instead of letting the student answer again.
   * The final check (posttest) keeps its retakes so a class student can still reach the pass mark. */
  answerOnce?: boolean
  /** The student's last saved answer, shown on a locked card instead of an empty form. */
  previousResponse?: Record<string, unknown> | null
  allowScripts?: boolean
  verifyLab?: VerifyWebLab; labStorageKey?: string
  loadDiscussion?: LoadDiscussion; studentId?: string; demoDiscussion?: boolean
}) {
  const [started, setStarted] = useState(() => performance.now())
  const formId = useId()
  const [selectedChoice, setSelectedChoice] = useState<string | undefined>(() =>
    typeof previousResponse?.choice_id === 'string' ? previousResponse.choice_id : undefined)
  /** What the student submitted, kept so a locked card can show it right after submitting too. */
  const [sentResponse, setSentResponse] = useState<Record<string, unknown> | null>(null)
  const checkingChoice = useRef(false)
  const check = activity.type === 'check' ? (activity as Activity<'check'>).content : null
  const choices = check?.choices
  const queryClient = useQueryClient()
  const discussionEnabled = activity.type === 'worksheet' && (activity as Activity<'worksheet'>).content.discussion_enabled === true
  const discussionKey = ['classmate-notes', studentId, activity.id]
  const discussion = useQuery({
    queryKey: discussionKey, enabled: discussionEnabled && !!loadDiscussion,
    queryFn: () => loadDiscussion!(activity.id),
  })
  const canShare = discussionEnabled && (demoDiscussion || discussion.data?.enabled)
  const attempt = useMutation({
    mutationFn: ({ response, score }: { response: unknown; score?: number }) => onAttempt({
      activity_id: activity.id, response, client_score: score, time_on_task_ms: Math.round(performance.now() - started),
    }),
    onSuccess: (result) => {
      setStarted(performance.now())
      onResult?.(result)
      onSaved?.()
      if (canShare && loadDiscussion) void queryClient.invalidateQueries({ queryKey: discussionKey })
    },
  })
  const done = activity.type !== 'content' && (attempt.isSuccess || status?.submitted)
  /** Answered already and not allowed to answer again. */
  const locked = answerOnce && !!done && activity.type !== 'posttest'
  const score = attempt.data ? attempt.data.score : status?.best_score
  const submit = (response: unknown = {}, score?: number) => attempt.mutate({ response, score })
  function chooseAnswer(choiceId: string) {
    if (locked || checkingChoice.current || (choiceId === selectedChoice && attempt.isSuccess)) return
    checkingChoice.current = true
    setSelectedChoice(choiceId)
    attempt.mutate({ response: { choice_id: choiceId } }, {
      onSettled: () => { checkingChoice.current = false },
    })
  }

  const complete = <Button type="button" disabled={attempt.isPending} onClick={() => submit()}>Mark as done</Button>
  const responseForm = (fields: { id: string; prompt: string; choices?: Choice[] }[], key?: string) => {
    if (!fields.length) return <><p>No questions were added to this activity.</p>{!done && complete}</>
    if (locked) {
      const saved = sentResponse ?? previousResponse ?? null
      const values = (key ? saved?.[key] : saved) as Record<string, unknown> | undefined
      const shown = (field: { id: string; choices?: Choice[] }) => {
        const value = values?.[field.id]
        if (typeof value !== 'string' || !value) return null
        return field.choices?.find(choice => choice.id === value)?.label ?? value
      }
      return <>
        <p className="rounded-xl bg-brand-tint px-4 py-3 font-semibold text-brand">Your answer is saved.</p>
        {values && <dl className="space-y-3">
          {fields.map(field => <div key={field.id}>
            <dt className="font-medium">{field.prompt}</dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-lg border border-divider bg-canvas px-3 py-2">
              {shown(field) ?? <span className="text-cic-muted">No answer</span>}
            </dd>
          </div>)}
        </dl>}
        {canShare && discussion.data?.shared && <DiscussionNotes notes={discussion.data.notes} fields={fields} />}
      </>
    }
    function send(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      if (attempt.isPending || (discussionEnabled && loadDiscussion && discussion.isPending)) return
      const data = new FormData(event.currentTarget)
      const answers = Object.fromEntries(fields.map(field => [field.id, String(data.get(formId + field.id) ?? '').trim()]))
      const response = key ? { [key]: answers, ...(canShare && key === 'fields' ? { share_discussion: true } : {}) } : answers
      setSentResponse(response)
      submit(response)
    }
    return <>
      <form className="space-y-3" onSubmit={send} onKeyDown={canShare ? event => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.currentTarget.requestSubmit()
        }
      } : undefined}>
        {fields.map(field => <AnswerField key={field.id} {...field} id={formId + field.id} />)}
        {canShare && <p className="text-sm">Your class can see these answers without your name. Leave out personal details.</p>}
        {discussionEnabled && !loadDiscussion && !demoDiscussion &&
          <p className="text-sm">Eligible students see anonymous classmate answers after submitting.</p>}
        <Button type="submit" disabled={attempt.isPending || !!(discussionEnabled && loadDiscussion && discussion.isPending)}>
          {canShare ? 'Submit and see classmate answers' : `Submit answer${fields.length > 1 ? 's' : ''}`}
        </Button>
      </form>
      {canShare && (discussion.data?.shared || (demoDiscussion && attempt.isSuccess)) &&
        <DiscussionNotes notes={demoDiscussion ? exampleNotes : discussion.data?.notes ?? []} fields={fields} />}
    </>
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
      case 'check': {
        const { prompt } = (activity as Activity<'check'>).content
        if (!choices?.length) return responseForm([{ id: 'text', prompt }])
        return <fieldset className="space-y-1" aria-busy={attempt.isPending}>
          <legend className="font-medium">{prompt}</legend>
          {choices.map(choice => <Button key={choice.id} type="button" variant="secondary"
            className="w-full justify-start text-left aria-pressed:bg-brand-tint"
            aria-pressed={selectedChoice === choice.id}
            aria-disabled={locked || attempt.isPending || (selectedChoice === choice.id && attempt.isSuccess)}
            onClick={() => chooseAnswer(choice.id)}>{choice.label}</Button>)}
        </fieldset>
      }
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
        // Same embeds as the instructor preview (YouTube, Vimeo, Google Drive); anything else stays a link.
        const embed = embedUrl(url)
        return <>
          {embed
            ? <div className="cic-video"><iframe src={embed} title={caption || 'Lesson video'} allowFullScreen loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" /></div>
            : <p><a className="underline" href={defaultUrlTransform(url)} target="_blank" rel="noreferrer">{caption || 'Open video'}</a></p>}
          {embed && caption && <p className="text-sm text-cic-muted">{caption}</p>}
          {!done && complete}
        </>
      }
      case 'slides': {
        const { url, caption } = (activity as Activity<'slides'>).content
        const embed = slidesUrl(url)
        return <>{embed && <iframe className="aspect-video w-full rounded-lg border border-divider" src={embed}
          title={caption || 'Slide deck'} loading="lazy" allowFullScreen />}{!done && complete}</>
      }
      case 'content':
        return null
      case 'code': {
        const payload = (activity as Activity<'code'>).content
        if (payload.lab?.verifier === 'cat-photo-v1') {
          return <CodeLab payload={payload} verifyWeb={verifyLab ?? previewCatPhotoChecks} storageKey={labStorageKey} completed={status?.submitted} />
        }
        if (payload.lab?.verifier === 'web-practice-v1') {
          return <><CodeLab payload={payload} storageKey={labStorageKey} allowSubmit={false} />{!done && complete}</>
        }
        const { starter_code, prompt } = payload
        return <>{starter_code && <pre className="overflow-auto"><code>{starter_code}</code></pre>}
          {responseForm([{ id: 'code', prompt: prompt || 'Write your code' }])}</>
      }
      default:
        return <><p>These materials are not available in the player yet.</p>{!done && complete}</>
    }
  }

  const { content } = activity
  const title = 'title' in content && typeof content.title === 'string' ? content.title : null
  const markdown = activity.type !== 'code' && 'markdown' in content && typeof content.markdown === 'string' ? content.markdown : null
  const themedArticle = activity.type === 'content' && (activity as Activity<'content'>).content.presentation === 'cic-article'
  let feedback: string | undefined
  // Right or wrong: from this visit's answer, else from the saved score (answer once = that one try).
  const correct: boolean | null = attempt.isSuccess ? attempt.data.is_correct
    : status?.best_score == null ? null : status.best_score >= 1
  if (choices?.length) {
    if (attempt.isPending) feedback = 'Checking your answer…'
    else if (attempt.isSuccess || (!attempt.isError && locked)) {
      feedback = correct === null ? 'Answer saved.'
        : correct ? (attempt.isSuccess ? 'Correct!' : 'Correct! You got this one right.')
        : answerOnce ? 'Incorrect. Keep going, you\'ll see this idea again.' : 'Incorrect. Try another answer.'
    } else if (!attempt.isError && correct) feedback = 'You answered correctly.'
  }

  return <div className="min-w-0 space-y-3">
    {themedArticle ? <CicArticle title={title || 'Read and explore'} markdown={markdown || ''} /> : <>
      {title && !hideTitle && <h3 className="text-base font-semibold text-brand">{title}</h3>}
      {markdown && <LessonMarkdown markdown={markdown} title={title ?? undefined} headingBase={4} />}
      {markdown && <LinkedVideos markdown={markdown} />}
    </>}
    {body()}
    {!!choices?.length && feedback && <p role="status" className={`rounded-xl px-4 py-3 font-semibold ${correct === false
      ? 'bg-warn-soft text-warn' : 'bg-brand-tint text-brand'}`}>{correct === false ? '✗ ' : correct ? '✓ ' : ''}{feedback}</p>}
    {attempt.isPending && !choices?.length && <p role="status">Saving…</p>}
    {attempt.isError && <p role="alert">Could not save your work. Try again.</p>}
    {done && !choices?.length && <p role="status" className="text-green-800">{score == null ? 'Completed' : `Completed · ${Math.round(score * 100)}%`}</p>}
  </div>
}

export function LessonLayout({ title, children }: { title: string; children: ReactNode }) {
  return <section className="cic-student-lesson">
    <h2 className="text-xl">{title}</h2>
    {children}
  </section>
}

export function LessonContent({ lesson, statuses, onAttempt, onSaved, allowScripts, checkLab, studentId, loadDiscussion }: {
  lesson: Lesson & { activities: Activity[] }
  statuses?: ReadonlyMap<string, ActivityStatus>
  onAttempt: (activity: Activity, input: AttemptInput) => ReturnType<SubmitActivity>
  onSaved?: () => void
  allowScripts?: boolean
  checkLab?: (activityId: string, source: string, signal: AbortSignal) => ReturnType<VerifyWebLab>
  studentId?: string
  loadDiscussion?: LoadDiscussion
}) {
  return <LessonLayout title={lesson.title}>
    {lesson.activities.map(activity => <Card key={activity.id}>
      <ActivityBlock activity={activity} status={statuses?.get(activity.id)} onAttempt={input => onAttempt(activity, input)}
        onSaved={onSaved} allowScripts={allowScripts} studentId={studentId} loadDiscussion={loadDiscussion}
        labStorageKey={studentId ? 'cic-learn.live-lab:' + studentId + ':' + activity.id : undefined}
        verifyLab={checkLab && (async (source, signal) => {
          const verified = await checkLab(activity.id, source, signal)
          if (verified.completed) onSaved?.()
          return verified
        })} />
    </Card>)}
  </LessonLayout>
}
