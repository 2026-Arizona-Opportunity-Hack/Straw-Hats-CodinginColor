// Owner: Jacky. One renderer per activity type. Each calls onDone(score?) when the
// student finishes, so the module player knows when to enable "Continue".
import { useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { recordAttempt } from '../api/student/index.ts'
import type { Choice } from '../shared/types/activities.ts'
import type { Activity } from '../shared/types/db.ts'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import { Button, Field, FormStatus, Input } from '../shared/ui/index.tsx'

export interface ActivityProps<T extends Activity['type'] = Activity['type']> {
  activity: Activity<T>
  classId: string
  /** Milliseconds since this step opened (time on task). */
  elapsedMs: () => number
  done: boolean
  onDone: (score?: number | null) => void
}

async function submit(p: ActivityProps, response: unknown, client_score?: number) {
  const result = await recordAttempt({
    activity_id: p.activity.id,
    class_id: p.classId,
    response,
    client_score,
    time_on_task_ms: p.elapsedMs(),
  })
  return result
}

/** Turns a YouTube, Vimeo or Google Drive share link into an embeddable URL. */
function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v') ?? u.pathname.split('/').pop()
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (u.hostname.includes('vimeo.com')) return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean).pop()}`
    if (u.hostname.includes('drive.google.com')) return url.replace(/\/view.*$/, '/preview')
    return null
  } catch {
    return null
  }
}

function ContentBlock({ activity, onDone }: ActivityProps<'content'>) {
  return (
    <div className="space-y-4">
      {/* react-markdown does not render raw HTML, so imported content stays safe. */}
      <div className="prose-cic max-w-none space-y-3 [&_code]:rounded [&_code]:bg-brand-tint [&_code]:px-1 [&_h2]:text-2xl [&_ul]:list-disc [&_ul]:pl-6">
        <ReactMarkdown>{activity.content.markdown}</ReactMarkdown>
      </div>
      <Button variant="secondary" onClick={() => onDone()}>I read this</Button>
    </div>
  )
}

function VideoBlock({ activity, onDone }: ActivityProps<'video'>) {
  const { url, caption, transcript } = activity.content
  const src = toEmbedUrl(url)
  return (
    <div className="space-y-3">
      {src ? (
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <iframe src={src} title={caption ?? 'Lesson video'} className="size-full" allow="encrypted-media; fullscreen" allowFullScreen />
        </div>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold underline">Open the video</a>
      )}
      {caption && <p className="text-cic-muted">{caption}</p>}
      {transcript && (
        <details className="rounded-lg border border-divider p-3">
          <summary className="cursor-pointer font-semibold">Read the transcript</summary>
          <p className="mt-2 whitespace-pre-wrap">{transcript}</p>
        </details>
      )}
      <Button variant="secondary" onClick={() => onDone()}>I watched this</Button>
    </div>
  )
}

/** Multiple choice used by check, exit and test items. */
function ChoiceList({ name, choices, value, onChange, disabled }: { name: string; choices: Choice[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2">
      {choices.map((c) => (
        <label key={c.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 ${value === c.id ? 'border-brand bg-brand-tint' : 'border-divider bg-white hover:border-brand-accent'}`}>
          <input type="radio" name={name} value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} disabled={disabled} className="size-5 accent-[var(--color-brand)]" />
          <span>{c.label}</span>
        </label>
      ))}
    </div>
  )
}

function CheckBlock(p: ActivityProps<'check'>) {
  const { prompt, choices, explanation } = p.activity.content
  const [choice, setChoice] = useState('')
  const [result, setResult] = useState<{ ok: boolean | null } | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const r = await submit(p, { choice })
    setResult({ ok: r.is_correct })
    // A wrong answer still counts as done; the student sees the explanation and can retry.
    p.onDone(r.score)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">
          <ReactMarkdown>{prompt}</ReactMarkdown>
        </legend>
        <ChoiceList name={p.activity.id} choices={choices} value={choice} onChange={(v) => { setChoice(v); setResult(null) }} />
      </fieldset>
      <Button type="submit" disabled={!choice}>Check my answer</Button>
      {result && (
        <FormStatus
          error={result.ok === false ? `Not quite. ${explanation ?? 'Try another answer.'}` : null}
          success={result.ok === true ? `Correct! ${explanation ?? ''}` : result.ok === null ? 'Answer saved.' : null}
        />
      )}
    </form>
  )
}

function WorksheetBlock(p: ActivityProps<'worksheet'>) {
  const { title, fields } = p.activity.content
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }))
  const complete = fields.every((f) => (answers[f.id] ?? '').trim() !== '')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const r = await submit(p, answers)
    p.onDone(r.score)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="text-xl">{title}</h2>
      {fields.map((f, i) => {
        const id = `${p.activity.id}-${f.id}`
        const label = `${i + 1}. ${f.prompt}`
        if (f.kind === 'multiple_choice')
          return (
            <fieldset key={f.id} className="space-y-2">
              <legend className="text-sm font-semibold">{label}</legend>
              <ChoiceList name={id} choices={f.choices} value={answers[f.id] ?? ''} onChange={(v) => set(f.id, v)} disabled={p.done} />
            </fieldset>
          )
        return (
          <Field key={f.id} id={id} label={label}>
            {f.kind === 'long_answer' ? (
              <textarea id={id} rows={4} value={answers[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} disabled={p.done} className="w-full rounded-lg border border-input p-3" />
            ) : (
              <Input id={id} value={answers[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} disabled={p.done} />
            )}
          </Field>
        )
      })}
      <Button type="submit" disabled={!complete || p.done}>{p.done ? 'Submitted' : 'Submit worksheet'}</Button>
      {p.done && <FormStatus success="Worksheet submitted. Nice work!" />}
    </form>
  )
}

/** Plain editor for now. TODO(Jacky): swap the textarea for CodeMirror + Pyodide Run. */
function CodeBlock(p: ActivityProps<'code'>) {
  const { prompt, starter_code } = p.activity.content
  const [code, setCode] = useState(starter_code)
  const id = `${p.activity.id}-code`

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const r = await submit(p, { code })
    p.onDone(r.score)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field id={id} label={prompt} hint="Replace every ___ with your code.">
        <textarea
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={Math.max(6, code.split('\n').length + 1)}
          className="w-full rounded-lg border border-input bg-[#10261a] p-3 font-mono text-sm text-[#e6f4ed]"
        />
      </Field>
      <Button type="submit" disabled={code.includes('___')}>Submit code</Button>
      {p.done && <FormStatus success="Code submitted." />}
    </form>
  )
}

function InteractiveBlock(p: ActivityProps<'interactive_html'>) {
  const { html, instructions, reports_score } = p.activity.content
  async function complete(score?: number) {
    await submit(p, null, score)
    p.onDone(score ?? null)
  }
  return (
    <div className="space-y-3">
      {instructions && <p>{instructions}</p>}
      <InteractiveHtmlFrame html={html} title={`Interactive activity: ${p.activity.concept}`} onComplete={(s) => void complete(s)} />
      {p.done ? <FormStatus success="Activity complete." /> : !reports_score && <Button onClick={() => void complete()}>Mark as done</Button>}
    </div>
  )
}

function ExitBlock(p: ActivityProps<'exit'>) {
  const { prompt, choices } = p.activity.content
  const [answer, setAnswer] = useState('')
  const id = `${p.activity.id}-exit`
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const r = await submit(p, { answer })
    p.onDone(r.score)
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">Exit question</p>
      {choices?.length ? (
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">{prompt}</legend>
          <ChoiceList name={id} choices={choices} value={answer} onChange={setAnswer} disabled={p.done} />
        </fieldset>
      ) : (
        <Field id={id} label={prompt}>
          <textarea id={id} rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={p.done} className="w-full rounded-lg border border-input p-3" />
        </Field>
      )}
      <Button type="submit" disabled={!answer.trim() || p.done}>{p.done ? 'Submitted' : 'Submit'}</Button>
    </form>
  )
}

/** Pretest and post-test: every item on one form, no feedback (so it measures learning). */
function AssessmentBlock(p: ActivityProps<'pretest' | 'posttest'>) {
  const { items } = p.activity.content
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const label = p.activity.type === 'pretest' ? 'Quick pretest' : 'Post-test'
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const r = await submit(p, answers)
    p.onDone(r.score)
  }
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-cic-muted">{label}: answer what you can. "Not sure" is fine; this is not graded.</p>
      {items.map((item, i) => (
        <fieldset key={item.id} className="space-y-2">
          <legend className="font-semibold">{i + 1}. {item.prompt}</legend>
          <ChoiceList name={`${p.activity.id}-${item.id}`} choices={item.choices} value={answers[item.id] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [item.id]: v }))} disabled={p.done} />
        </fieldset>
      ))}
      <Button type="submit" disabled={p.done || Object.keys(answers).length < items.length}>{p.done ? 'Submitted' : `Submit ${label.toLowerCase()}`}</Button>
    </form>
  )
}

export function ActivityRenderer(props: ActivityProps) {
  // Key by activity id so local state resets when the student moves to the next step.
  switch (props.activity.type) {
    case 'content': return <ContentBlock key={props.activity.id} {...(props as ActivityProps<'content'>)} />
    case 'video': return <VideoBlock key={props.activity.id} {...(props as ActivityProps<'video'>)} />
    case 'check': return <CheckBlock key={props.activity.id} {...(props as ActivityProps<'check'>)} />
    case 'worksheet': return <WorksheetBlock key={props.activity.id} {...(props as ActivityProps<'worksheet'>)} />
    case 'code': return <CodeBlock key={props.activity.id} {...(props as ActivityProps<'code'>)} />
    case 'interactive_html': return <InteractiveBlock key={props.activity.id} {...(props as ActivityProps<'interactive_html'>)} />
    case 'exit': return <ExitBlock key={props.activity.id} {...(props as ActivityProps<'exit'>)} />
    case 'pretest':
    case 'posttest': return <AssessmentBlock key={props.activity.id} {...(props as ActivityProps<'pretest' | 'posttest'>)} />
  }
}
