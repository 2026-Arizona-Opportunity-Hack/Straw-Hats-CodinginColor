import { useEffect, useRef, useState } from 'react'
import { maxSourceText } from '../shared/curriculum/draft'
import { LessonPreview } from './LessonPreview'
import { requestMaterialsDraft, type MaterialDraft } from './materialsDraft'
import type { Module } from './model'
import { Dialog } from './ui'

export function ImportMaterials({ mode, close, onMarkdown, onDraft }: {
  mode: 'markdown' | 'converter'
  close: () => void
  onMarkdown: (text: string) => void
  onDraft: (module: Module) => void
}) {
  const [text, setText] = useState('')
  const [audience, setAudience] = useState('')
  const [draft, setDraft] = useState<MaterialDraft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const converter = mode === 'converter'

  return <Dialog title={draft ? 'Review module draft' : converter ? 'Draft a module from materials' : 'Import Markdown'} wide={!!draft} onClose={close}>
    {draft ? <div className="ic-stack">
      <h2>{draft.module.title}</h2>
      {draft.reviewNotes.length > 0 && <section><h3>Instructor review notes</h3><ul>
        {draft.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}
      </ul></section>}
      {draft.references.length > 0 && <section><h3>Verified references</h3><ul>
        {draft.references.map(ref => <li key={ref.id}><a href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a></li>)}
      </ul></section>}
      {draft.module.lessons.map(lesson => <details key={lesson.id}><summary>{lesson.title}</summary><LessonPreview lesson={lesson} /></details>)}
      <div className="ic-form-footer">
        <button type="button" className="ic-button" onClick={() => setDraft(null)}>Back to materials</button>
        <button type="button" className="ic-button ic-primary" onClick={() => onDraft(draft.module)}>Add as draft</button>
      </div>
    </div> : <form className="ic-stack" onSubmit={async event => {
      event.preventDefault()
      if (pending.current || !text.trim()) return
      if (!converter) return onMarkdown(text.trim())
      const request = new AbortController()
      pending.current = request
      setBusy(true)
      setError('')
      try {
        const result = await requestMaterialsDraft({ kind: 'lesson_plan', text: text.trim(), audience: audience.trim() }, request.signal)
        if (!request.signal.aborted) setDraft(result)
      } catch (problem) {
        if (!request.signal.aborted) setError(problem instanceof Error ? problem.message : 'Could not generate a draft.')
      } finally {
        pending.current = null
        if (!request.signal.aborted) setBusy(false)
      }
    }}>
      {converter && <p className="ic-note">Use curriculum materials approved for processing. Leave out student names and records.</p>}
      <label>{converter ? 'Lesson plan proposal' : 'Markdown'}<textarea rows={7} value={text} maxLength={converter ? maxSourceText : undefined}
        onChange={event => setText(event.target.value)} disabled={busy} /></label>
      <label>Text or Markdown file<input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" disabled={busy} onChange={async event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (!file) return
        setError('')
        try {
          if (file.size > 320_000) throw new Error('Choose a smaller text file.')
          const input = await file.text()
          if (converter && input.length > maxSourceText) throw new Error('Choose a proposal under 80,000 characters.')
          if (!input.trim()) throw new Error('Choose a file with lesson text.')
          setText(input)
        } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not read the file.') }
      }} /></label>
      {converter && <label>Audience (optional)<input value={audience} maxLength={180} disabled={busy}
        onChange={event => setAudience(event.target.value)} /></label>}
      {error && <p className="ic-error" role="alert">{error}</p>}
      {busy && <p role="status">Generating your draft…</p>}
      <div className="ic-form-footer"><button type="submit" className="ic-button ic-primary" disabled={busy || !text.trim()}>
        {converter ? 'Generate draft' : 'Add article'}
      </button></div>
    </form>}
  </Dialog>
}
