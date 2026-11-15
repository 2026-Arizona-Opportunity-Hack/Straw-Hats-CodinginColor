import { useEffect, useRef, useState } from 'react'
import { maxDraftImages, maxFigureDataUrl, maxImagePrompt, validLessonFigure, type ImageDraftResult, type LessonFigure } from '../shared/curriculum/figure'
import type { GenerationStage } from '../shared/curriculum/progress'
import { FigureMarkupEditor } from './FigureMarkupEditor'
import { GenerationStatus } from './GenerationStatus'
import type { DraftQaFixture } from './materialsDraft'
import type { Module } from './model'
import { requestCurriculum } from './requestCurriculum'

async function compressImage(dataUrl: string) {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const canvas = document.createElement('canvas')
  const ratio = Math.min(1, 1024 / Math.max(img.width, img.height))
  canvas.width = Math.round(img.width * ratio)
  canvas.height = Math.round(img.height * ratio)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare the image.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(img, 0, 0, canvas.width, canvas.height)
  for (const quality of [.86, .74, .58, .42]) {
    const result = canvas.toDataURL('image/jpeg', quality)
    if (result.length <= maxFigureDataUrl) return result
  }
  throw new Error('This image is too large to add to the lesson.')
}

export function DraftImageReview({ module, ticket, fixture, onApprove, onBusy }: {
  module: Module; ticket?: string; fixture?: DraftQaFixture; onApprove: (placement: string, figure: LessonFigure) => void; onBusy: (busy: boolean) => void
}) {
  const [prompt, setPrompt] = useState(fixture ? 'A cat resting on its side' : '')
  const [placement, setPlacement] = useState(module.lessons[0]?.activities.find(a => a.type === 'content')?.id ?? '')
  const [remaining, setRemaining] = useState(fixture?.scenario === 'limit' ? 0
    : fixture?.scenario === 'image' ? maxDraftImages - 1 : maxDraftImages)
  const [figure, setFigure] = useState<LessonFigure | null>(() => fixture?.scenario === 'image'
    ? { src: fixture.src, alt: 'A cat resting on its side', caption: '', marks: [] } : null)
  const [suggestions, setSuggestions] = useState<'pending' | 'ready' | 'empty' | 'unavailable'>('pending')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<GenerationStage>('preparing')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const figureSource = figure?.src
  useEffect(() => {
    if (!figureSource) return
    let cancelled = false
    void import('./figureSuggestions').then(({ suggestFigureMarks }) => suggestFigureMarks(figureSource)).then(marks => {
      if (cancelled) return
      setFigure(current => current?.src === figureSource && !current.marks.length ? { ...current, marks } : current)
      setSuggestions(marks.length ? 'ready' : 'empty')
    }).catch(() => {
      if (!cancelled) setSuggestions('unavailable')
    })
    return () => { cancelled = true }
  }, [figureSource])

  async function generate() {
    if (!prompt.trim() || !remaining || request.current || figure) return
    setSuggestions('pending')
    if (fixture) {
      setRemaining(remaining - 1)
      setFigure({ src: fixture.src, alt: 'A cat resting on its side', caption: '', marks: [] })
      return
    }
    if (!ticket) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    onBusy(true)
    setError('')
    setStage('preparing')
    try {
      const result = await requestCurriculum<ImageDraftResult>({ kind: 'generate_image', ticket, prompt }, controller.signal, setStage)
      controller.signal.throwIfAborted()
      setRemaining(result.remaining)
      if (result.error || !result.src) throw new Error(result.error || 'The model did not return an image.')
      const src = await compressImage(result.src)
      controller.signal.throwIfAborted()
      setFigure({ src, alt: '', caption: '', marks: [] })
    } catch (problem) {
      if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'Could not generate an image.')
    } finally {
      if (!controller.signal.aborted) { setBusy(false); onBusy(false) }
      request.current = null
    }
  }

  return <section className="ic-stack" aria-label="Generate an image">
    <p role="status" className="ic-note">{remaining} of {maxDraftImages} image generations left for this module.</p>
    {figure ? <div className="ic-image-review-layout">
      <div className="ic-stack">
        <p role="status" className="ic-note">{{
          pending: 'Looking for objects to outline…',
          ready: 'Review the suggested boxes and masks before approving.',
          empty: 'No objects were recognized. You can draw your own boxes and masks.',
          unavailable: 'Automatic annotations are unavailable. You can draw your own boxes and masks.',
        }[suggestions]}</p>
        <FigureMarkupEditor figure={figure} onChange={setFigure} />
      </div>
      <aside className="ic-stack ic-image-review-popover" aria-label="Review generated image">
        <h3>Review image</h3>
        <label>Place after<select value={placement} onChange={event => setPlacement(event.target.value)}>
          {module.lessons.map(lesson => <optgroup key={lesson.id} label={lesson.title}>
            {lesson.activities.filter(a => a.type === 'content').map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </optgroup>)}
        </select></label>
        <button type="button" className="ic-button ic-primary" disabled={!placement || !validLessonFigure(figure)}
          onClick={() => { onApprove(placement, figure); setFigure(null) }}>Approve and add</button>
        <button type="button" className="ic-button" onClick={() => setFigure(null)}>Reject image</button>
      </aside>
    </div> : <>
      <label>Describe the scene<textarea rows={4} maxLength={maxImagePrompt} value={prompt} disabled={busy || !remaining}
        placeholder="A bicycle next to a dog on a park path" onChange={event => setPrompt(event.target.value)} /></label>
      <button type="button" className="ic-button ic-primary ic-fit" disabled={busy || !remaining || !prompt.trim()}
        onClick={() => void generate()}>Generate image</button>
    </>}
    {busy && <GenerationStatus stage={stage} title="Generating your image" />}
    {error && <p className="ic-error" role="alert">{error}</p>}
  </section>
}
