import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { defaultDraftQuality, draftQualities, isDraftQuality, maxDraftRequest, maxInstructorInstructions, maxSelectedImages, maxSourceText, type DraftSource } from '../shared/curriculum/draft'
import type { LessonFigure } from '../shared/curriculum/figure'
import type { GenerationStage } from '../shared/curriculum/progress'
import { DraftImageReview } from './DraftImageReview'
import { DraftLabReview } from './DraftLabReview'
import { includeDraftLab, type DraftLab } from './draftLab'
import { GenerationStatus } from './GenerationStatus'
import { StudentPreview } from './StudentLessonPreview'
import { sampleCurriculum } from './requestCurriculum'
import { requestMaterialsDraft, type DraftQaFixture, type MaterialDraft } from './materialsDraft'
import type { readPptx } from './pptx'
import { newActivity, type Activity, type Module } from './model'
import { Dialog } from './ui'

const audiencePresets = [
  'Middle school students new to programming',
  'High school students new to programming',
  'College students new to programming',
  'Adult learners new to programming',
]

export function ImportMaterials({ mode, local, close, onMarkdown, onDraft }: {
  mode: 'markdown' | 'converter'
  local: boolean
  close: () => void
  onMarkdown: (text: string) => void
  onDraft: (module: Module) => void
}) {
  const [text, setText] = useState('')
  const [audience, setAudience] = useState('')
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const audienceHint = useId()
  const audienceOptions = useId()
  const instructionsHint = useId()
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
  const qaImage = useRef<HTMLInputElement>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const converter = mode === 'converter'
  if (draft) return <DraftPreview draft={draft.module} imageTicket={draft.imageTicket} fixture={draft.fixture} local={local} close={close} back={() => setDraft(null)} onDraft={onDraft}
    audience={audience.trim()} additionalInstructions={additionalInstructions.trim()}
    material={deck ? deck.slides.map(slide => `Slide ${slide.number}\n${slide.text}\n${slide.notes}`).join('\n\n') : text.trim()} />

  return <Dialog title={converter ? 'Draft a module from materials' : 'Import Markdown'} onClose={close}>
    <form className="ic-stack" onSubmit={async event => {
      event.preventDefault()
      if (pending.current || !ready) return
      if (!converter) return onMarkdown(text.trim())
      const request = new AbortController()
      pending.current = request
      setStage('preparing')
      setBusy(true)
      setError('')
      try {
        const preferences = { audience: audience.trim(), additionalInstructions: additionalInstructions.trim(), quality }
        const source: DraftSource = deck
          ? { kind: 'slide_deck', ...preferences,
            slides: deck.slides.map(slide => deck.images.some(image => image.slideNumber === slide.number && !selected.includes(image.id))
              ? { ...slide, reviewFlags: [...slide.reviewFlags, 'Review images that were left out of model analysis.'] } : slide),
            images: deck.images.filter(image => selected.includes(image.id)),
          }
          : { kind: 'lesson_plan', text: text.trim(), ...preferences }
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
      {converter && (sampleCurriculum
        ? <p className="ic-note">Sample mode copies your materials into a draft. Enable AI generation to build a lesson and look up references.</p>
        : <p className="ic-note">Use curriculum materials approved for processing. Leave out student names and records.</p>)}
      {converter && import.meta.env.DEV && local && <fieldset disabled={busy || reading}>
        <legend>Local QA</legend>
        <label>Test image (optional)<input ref={qaImage} type="file" accept="image/png,image/jpeg" /></label>
        <div className="ic-row">
          {(['preview', 'image', 'limit'] as const).map(scenario => <button key={scenario} type="button" className="ic-button"
            onClick={async () => {
              if (pending.current) return
              const request = new AbortController()
              const file = qaImage.current?.files?.[0]
              pending.current = request
              setError('')
              setReading(true)
              try {
                const { localQaDraft } = await import('./draftQa')
                const result = await localQaDraft(scenario, file)
                if (!request.signal.aborted) setDraft(result)
              } catch (problem) {
                if (!request.signal.aborted) setError(problem instanceof Error ? problem.message : 'Could not load the test image.')
              } finally {
                pending.current = null
                if (!request.signal.aborted) setReading(false)
              }
            }}>{scenario === 'preview' ? 'Test lesson preview' : scenario === 'image' ? 'Test image review' : 'Test image limit'}</button>)}
        </div>
      </fieldset>}
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
      {converter && <>
        <div>
          <label>Who is this for? (optional)<input value={audience} maxLength={180} disabled={busy}
            placeholder="High school students new to programming" aria-describedby={audienceHint} list={audienceOptions}
            onChange={event => setAudience(event.target.value)} /></label>
          <datalist id={audienceOptions}>{audiencePresets.map(preset => <option key={preset} value={preset} />)}</datalist>
          <p className="ic-note" id={audienceHint}>Choose a suggestion or describe your learners and what they already know.</p>
        </div>
        <div>
          <label>Additional instructions (optional)<textarea rows={3} value={additionalInstructions} maxLength={maxInstructorInstructions} disabled={busy}
            placeholder="Use W3Schools to explain CSS selectors. Add a short practice task." aria-describedby={instructionsHint}
            onChange={event => setAdditionalInstructions(event.target.value)} /></label>
          <p className="ic-note" id={instructionsHint}>Say what to emphasize, include, or use as a reference.</p>
        </div>
      </>}
      {converter && <label>Draft quality<select value={quality} disabled={busy} onChange={event => {
        const value = event.target.value
        if (isDraftQuality(value)) setQuality(value)
      }}>
        {Object.entries(draftQualities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}
      {error && <p className="ic-error" role="alert">{error}</p>}
      {busy && <GenerationStatus stage={stage} title="Generating your draft" />}
      <div className="ic-form-footer"><button type="submit" className="ic-button ic-primary" disabled={busy || reading || !ready}>
        {converter ? (sampleCurriculum ? 'Preview sample draft' : 'Generate draft') : 'Add article'}
      </button></div>
    </form>
  </Dialog>
}


function DraftPreview({ draft, imageTicket, fixture, local, close, back, onDraft, audience, additionalInstructions, material }: {
  draft: Module
  imageTicket?: string
  fixture?: DraftQaFixture
  local: boolean
  close: () => void
  back: () => void
  onDraft: (module: Module) => void
  audience: string
  additionalInstructions: string
  material: string
}) {
  const [view, setView] = useState<'preview' | 'lab' | 'image'>(fixture && fixture.scenario !== 'preview' ? 'image' : 'preview')
  const [lessonId, setLessonId] = useState(draft.lessons[0]?.id)
  const [lab, setLab] = useState<DraftLab | null>(null)
  const [labBusy, setLabBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [images, setImages] = useState<{ placement: string; activity: Activity }[]>([])
  const [focusFigure, setFocusFigure] = useState<string>()
  const module = useMemo(() => includeDraftLab({ ...draft, lessons: draft.lessons.map(item => ({
    ...item, activities: item.activities.flatMap(activity => [
      activity, ...images.filter(image => image.placement === activity.id).map(image => image.activity),
    ]),
  })) }, lab), [draft, images, lab])
  useEffect(() => {
    if (focusFigure) document.getElementById('lesson-figure-' + focusFigure)?.scrollIntoView({ block: 'center' })
  }, [focusFigure])

  function approveImage(placement: string, figure: LessonFigure) {
    const target = draft.lessons.find(item => item.activities.some(a => a.id === placement))
    if (!target) return
    const activity = { ...newActivity('content'), title: 'Lesson image', figure }
    setImages(current => [...current, { placement, activity }])
    setLessonId(target.id)
    setView('preview')
    setFocusFigure(activity.id)
  }
  const lesson = module.lessons.find(item => item.id === lessonId)

  return <Dialog title="Preview module draft" wide onClose={close} footer={<>
    <button type="button" className="ic-button" onClick={back}>Back to materials</button>
    <button type="button" className="ic-button ic-primary" disabled={labBusy || imageBusy} onClick={() => onDraft(module)}>Add as draft</button>
  </>}>
    <div className="ic-stack ic-draft-preview">
      <h2>{module.title}</h2>
      {fixture && <p className="ic-note">Local test data. This preview makes no paid AI requests.</p>}
      <div className="ic-tab-row" role="group" aria-label="Draft views">
        <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Student preview</button>
        {(imageTicket || fixture) && <button type="button" aria-pressed={view === 'image'} onClick={() => setView('image')}>Generate image</button>}
        {!fixture && <button type="button" aria-pressed={view === 'lab'} onClick={() => setView('lab')}>Coding lab</button>}
      </div>
      <div hidden={view !== 'preview'}>
        <div className="ic-stack">
          {module.lessons.length > 1 && <label>Lesson
            <select value={lessonId} onChange={event => setLessonId(event.target.value)}>
              {module.lessons.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
            </select>
          </label>}
          {lesson && <StudentPreview moduleId={module.id} lessons={[lesson]} local={local} />}
        </div>
      </div>
      {(imageTicket || fixture) && <div hidden={view !== 'image'}>
        <DraftImageReview module={draft} ticket={imageTicket} fixture={fixture} onApprove={approveImage} onBusy={setImageBusy} />
      </div>}
      {!fixture && <div hidden={view !== 'lab'}>
        <DraftLabReview module={draft} material={material} audience={audience}
          additionalInstructions={additionalInstructions} selected={lab} onChange={setLab} onBusy={setLabBusy} />
      </div>}
    </div>
  </Dialog>
}
