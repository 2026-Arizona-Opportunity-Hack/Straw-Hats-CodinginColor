import { lazy, Suspense, useState } from 'react'
import type { InteractiveHtmlPayload } from '../shared/types/activities.ts'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import { maxHtmlBytes } from '../shared/ui/isolatedHtml.ts'

const Editor = lazy(() => import('../shared/ui/SourceEditor.tsx').then(module => ({ default: module.SourceEditor })))
export function HtmlActivityEditor({ value, onChange }: { value: InteractiveHtmlPayload; onChange: (value: InteractiveHtmlPayload) => void }) {
  const [error, setError] = useState('')
  return <div className="ic-stack">
    <label>Instructions<textarea rows={2} value={value.instructions ?? ''} onChange={event => onChange({ ...value, instructions: event.target.value })} /></label>
    <label>Completion<select value={value.reports_score ? 'signal' : 'manual'} onChange={event => onChange({ ...value, reports_score: event.target.value === 'signal' })}>
      <option value="manual">Student marks it done</option><option value="signal">Activity reports completion</option>
    </select></label>
    {value.reports_score && <p className="ic-note">Send <code>cic:complete</code> with an optional practice score from 0 to 1.</p>}
    <label>Import .html file<input type="file" accept=".html,text/html" onChange={async event => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) return
      if (!/\.html$/i.test(file.name) || file.size > maxHtmlBytes) return setError('Choose a single .html file up to 256 KB.')
      try { onChange({ ...value, html: await file.text() }); setError('') }
      catch { setError('Could not read the HTML file.') }
    }} /></label>
    {error && <p role="alert" className="ic-error">{error}</p>}
    <div><strong>HTML source</strong>
      <Suspense fallback={<p role="status">Loading code editor…</p>}><Editor label="HTML source" language="html" value={value.html} onChange={html => onChange({ ...value, html })} /></Suspense>
    </div>
  </div>
}

export function HtmlActivityPreview({ activity, title, scripts, onComplete, completed }: {
  activity: InteractiveHtmlPayload; title: string; scripts: boolean
  onComplete?: (score?: number) => void; completed?: boolean
}) {
  const [running, setRunning] = useState<InteractiveHtmlPayload | null>(null)
  const [message, setMessage] = useState('')
  function run() {
    if (!activity.html.trim() || new TextEncoder().encode(activity.html).length > maxHtmlBytes) {
      setMessage('Enter HTML source up to 256 KB.')
      return
    }
    setRunning(activity)
    setMessage('')
  }
  // Without scripts nothing can run, so show the page embedded right away.
  if (!scripts) {
    const tooBig = new TextEncoder().encode(activity.html).length > maxHtmlBytes
    return <div className="ic-stack">
      {activity.instructions && <p>{activity.instructions}</p>}
      {/<script/i.test(activity.html) && <p className="ic-note">This page uses scripts, which only run in the local demo. Students see it without them.</p>}
      {!activity.html.trim() ? <p className="ic-note">Add HTML source to see the page here.</p>
        : tooBig ? <p className="ic-note">This page is over 256 KB, so it cannot be shown.</p>
        : <InteractiveHtmlFrame html={activity.html} title={title} />}
      {onComplete && !completed && activity.html.trim() && !tooBig &&
        <div className="ic-row"><button className="ic-button ic-primary" type="button" onClick={() => onComplete()}>Mark as done</button></div>}
    </div>
  }
  return <div className="ic-stack">
    {activity.instructions && <p>{activity.instructions}</p>}
    <div className="ic-row">
      <button className="ic-button" type="button" onClick={run} disabled={running === activity}>{onComplete ? 'Start HTML activity' : 'Run HTML preview'}</button>
      {running && <button className="ic-button" type="button" onClick={() => { setRunning(null); setMessage('') }}>Reset preview</button>}
      {running && onComplete && !activity.reports_score && !completed && <button className="ic-button ic-primary" type="button" onClick={() => onComplete()}>Mark as done</button>}
    </div>
    {message && <p role="status" className="ic-note">{message}</p>}
    {running && <InteractiveHtmlFrame html={running.html} title={title} allowScripts={scripts}
      onComplete={running.reports_score && !completed ? score => onComplete ? onComplete(score) : setMessage(score === undefined ? 'Completion received.' : 'Practice score: ' + Math.round(score * 100) + '%') : undefined} />}
  </div>
}
