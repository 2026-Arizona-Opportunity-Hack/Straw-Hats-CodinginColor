// Owner: Jacky. Renders a module as one scrolling page of blocks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CicArticle } from '../shared/curriculum/CicArticle'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import { getModule, listActivityStatus, recordAttempt, type ActivityStatus } from '../api/student/index.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import type { Choice } from '../shared/types/activities.ts'
import type { Activity } from '../shared/types/db.ts'
import { isLocalDemo } from '../shared/supabase.ts'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import { Button, Card, PageHeader } from '../shared/ui/index.tsx'

function AnswerField({ id, prompt, choices }: { id: string; prompt: string; choices?: Choice[] }) {
  return choices?.length ? (
    <fieldset className="space-y-1">
      <legend className="font-medium">{prompt}</legend>
      {choices.map(choice => <label key={choice.id} className="flex items-center gap-2">
        <input type="radio" name={id} value={choice.id} required />{choice.label}
      </label>)}
    </fieldset>
  ) : (
    <label className="block font-medium">{prompt}
      <textarea className="block w-full rounded-md border border-divider p-2 font-normal" name={id} rows={3} maxLength={2000} required />
    </label>
  )
}

function ActivityBlock({ activity, status, onSaved }: {
  activity: Activity; status?: ActivityStatus; onSaved: () => void
}) {
  const [started, setStarted] = useState(() => performance.now())
  const formId = useId()
  const attempt = useMutation({
    mutationFn: ({ response, score }: { response: unknown; score?: number }) => recordAttempt({
      activity_id: activity.id, response, client_score: score, time_on_task_ms: Math.round(performance.now() - started),
    }),
    onSuccess: () => { setStarted(performance.now()); onSaved() },
  })
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
          <InteractiveHtmlFrame html={html} allowScripts={isLocalDemo} title={activity.concept}
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
        return <><p><a className="underline" href={defaultUrlTransform(url)} target="_blank" rel="noreferrer">{caption || 'Open video'}</a></p>{!done && complete}</>
      }
      case 'content': {
        const { markdown, presentation, title } = (activity as Activity<'content'>).content
        return <>{presentation === 'cic-article'
          ? <CicArticle title={title || activity.concept} markdown={markdown} />
          : <Markdown skipHtml>{markdown}</Markdown>}{!done && complete}</>
      }
      case 'code': {
        const { starter_code, prompt } = (activity as Activity<'code'>).content
        return <>{starter_code && <pre className="overflow-auto"><code>{starter_code}</code></pre>}
          {responseForm([{ id: 'code', prompt: prompt || 'Write your code' }])}</>
      }
      default:
        return <><p>These materials are not available in the player yet.</p>{!done && complete}</>
    }
  }

  return <div className="space-y-3">
    {body()}
    {attempt.isPending && <p role="status">Saving…</p>}
    {attempt.isError && <p role="alert">Could not save your work. Try again.</p>}
    {done && <p role="status" className="text-green-800">{score == null ? 'Completed' : `Completed · ${Math.round(score * 100)}%`}</p>}
  </div>
}

export function ModulePlayer() {
  const { moduleId = '' } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const studentId = profile?.id
  const { data: mod, isLoading, isError } = useQuery({
    queryKey: ['module', studentId, moduleId], queryFn: () => getModule(moduleId),
  })
  const activityKey = ['moduleActivities', studentId, moduleId]
  const { data: progress = [], isLoading: progressLoading, isError: progressError } = useQuery({
    queryKey: activityKey, queryFn: () => listActivityStatus(moduleId), enabled: !!mod,
  })

  if (isLoading || (mod && progressLoading)) return <p role="status">Loading lesson…</p>
  if (isError || progressError) return <p role="alert">Could not load this module. Try reloading the page.</p>
  if (!mod) return <p>This module is unavailable. <Link className="underline" to="/student">Back to my courses</Link></p>

  function refreshProgress() {
    void queryClient.invalidateQueries({ queryKey: activityKey })
    void queryClient.invalidateQueries({ queryKey: ['moduleStatus', studentId, mod?.course_id] })
  }
  const statuses = new Map(progress.map(status => [status.activity_id, status]))

  return <>
    <PageHeader title={mod.title} subtitle={mod.concept} />
    <div className="space-y-6">
      {mod.lessons.map(lesson => <section key={lesson.id} className="space-y-3">
        <h2 className="text-xl">{lesson.title}</h2>
        {lesson.activities.map(activity => <Card key={activity.id}>
          <ActivityBlock activity={activity} status={statuses.get(activity.id)} onSaved={refreshProgress} />
        </Card>)}
      </section>)}
    </div>
  </>
}
