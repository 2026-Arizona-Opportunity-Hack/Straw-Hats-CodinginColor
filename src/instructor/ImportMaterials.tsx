import { useEffect, useRef, useState } from 'react'
import { defaultDraftQuality, draftQualities, isDraftQuality, maxDraftRequest, maxSelectedImages, maxSourceText, type DraftSource } from '../shared/curriculum/draft'
import type { GenerationStage } from '../shared/curriculum/progress'
import { GenerationStatus } from './GenerationStatus'
import { LessonPreview } from './LessonPreview'
import { requestMaterialsDraft, type MaterialDraft } from './materialsDraft'
import type { readPptx } from './pptx'
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
  const [quality, setQuality] = useState(defaultDraftQuality)
  const [draft, setDraft] = useState<MaterialDraft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<GenerationStage>('preparing')
  const [reading, setReading] = useState(false)
  const [deck, setDeck] = useState<(Awaited<ReturnType<typeof readPptx>> & { name: string }) | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const ready = deck ? !!selected.length || deck.slides.some(slide => slide.text.trim() || slide.notes.trim()) : !!text.trim()
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
      if (pending.current || !ready) return
      if (!converter) return onMarkdown(text.trim())
      const request = new AbortController()
      pending.current = request
      setStage('preparing')
      setBusy(true)
      setError('')
      try {
        const source: DraftSource = deck
          ? { kind: 'slide_deck', audience: audience.trim(), quality,
            slides: deck.slides.map(slide => deck.images.some(image => image.slideNumber === slide.number && !selected.includes(image.id))
              ? { ...slide, reviewFlags: [...slide.reviewFlags, 'Review images that were left out of model analysis.'] } : slide),
            images: deck.images.filter(image => selected.includes(image.id)),
          }
          : { kind: 'lesson_plan', text: text.trim(), audience: audience.trim(), quality }
        if (new Blob([JSON.stringify(source)]).size > maxDraftRequest) throw new Error('Choose fewer images or split the source.')
        const result = await requestMaterialsDraft(source, request.signal, setStage)
        if (!request.signal.aborted) setDraft(result)
      } catch (problem) {
        if (!request.signal.aborted) setError(problem instanceof Error ? problem.message : 'Could not generate a draft.')
      } finally {
        pending.current = null
        if (!request.signal.aborted) setBusy(false)
      }
    }}>
      {converter && <p className="ic-note">Use curriculum materials approved for processing. Leave out student names and records.</p>}
      {!deck && <label>{converter ? 'Lesson plan proposal' : 'Markdown'}<textarea rows={7} value={text} maxLength={converter ? maxSourceText : undefined}
        onChange={event => setText(event.target.value)} disabled={busy || reading} /></label>}
      <label>{converter ? 'Text, Markdown, or PowerPoint file' : 'Text or Markdown file'}
        <input type="file" accept={converter ? '.txt,.md,.markdown,.pptx' : '.txt,.md,.markdown,text/plain,text/markdown'} disabled={busy || reading} onChange={async event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file || pending.current) return
          setError('')
          const read = new AbortController()
          pending.current = read
          setReading(true)
          try {
            if (converter && /\.pptx$/i.test(file.name)) {
              const { readPptx } = await import('./pptx')
              const contents = await readPptx(file, read.signal)
              if (!read.signal.aborted) {
                setDeck({ ...contents, name: file.name })
                setSelected([])
              }
            } else {
              if (file.size > (converter ? 320_000 : 200_000)) throw new Error('Choose a smaller text file.')
              const input = await file.text()
              if (converter && input.length > maxSourceText) throw new Error('Choose a proposal under 80,000 characters.')
              if (!input.trim()) throw new Error('Choose a file with lesson text.')
              if (!read.signal.aborted) {
                setText(input)
                setDeck(null)
                setSelected([])
              }
            }
          } catch (problem) {
            if (!read.signal.aborted) setError(problem instanceof Error ? problem.message : 'Could not read the file.')
          } finally {
            pending.current = null
            if (!read.signal.aborted) setReading(false)
          }
        }} />
      </label>
      {reading && <p role="status">Reading the file…</p>}
      {deck && <section className="ic-stack">
        <div className="ic-row">
          <span>{deck.name} · {deck.slides.length} visible slides</span>
          <button type="button" className="ic-link-button" disabled={busy || reading} onClick={() => {
            setDeck(null)
            setSelected([])
          }}>Remove deck</button>
        </div>
        {!!deck.images.length && <fieldset disabled={busy || reading}>
          <legend>Send selected images for analysis (optional, up to six)</legend>
          <div className="ic-draft-images">{deck.images.map((image, index) => <label key={image.id}>
            <input type="checkbox" checked={selected.includes(image.id)} disabled={!selected.includes(image.id) && selected.length >= maxSelectedImages}
              onChange={event => {
                const checked = event.target.checked
                setSelected(current => checked ? [...current, image.id] : current.filter(id => id !== image.id))
              }} />
            <img src={image.dataUrl} alt="" loading="lazy" />
            <span>Slide {image.slideNumber} · Image {index + 1}</span>
          </label>)}</div>
        </fieldset>}
        {!ready && <p className="ic-note">This deck has no extractable text. Select an image or supply the lesson text.</p>}
      </section>}
      {converter && <label>Audience (optional)<input value={audience} maxLength={180} disabled={busy}
        onChange={event => setAudience(event.target.value)} /></label>}
      {converter && <label>Draft quality<select value={quality} disabled={busy} onChange={event => {
        const value = event.target.value
        if (isDraftQuality(value)) setQuality(value)
      }}>
        {Object.entries(draftQualities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}
      {error && <p className="ic-error" role="alert">{error}</p>}
      {busy && <GenerationStatus stage={stage} title="Generating your draft" />}
      <div className="ic-form-footer"><button type="submit" className="ic-button ic-primary" disabled={busy || reading || !ready}>
        {converter ? 'Generate draft' : 'Add article'}
      </button></div>
    </form>}
  </Dialog>
}
