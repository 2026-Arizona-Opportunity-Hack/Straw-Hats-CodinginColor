import { useEffect, useRef, useState } from 'react'
import type { CodingLabRequest, DraftCodingLab } from '../shared/curriculum/codingLab'
import type { GenerationStage } from '../shared/curriculum/progress'
import { CodeLab } from '../shared/labs/CodeLab'
import { checkWebPractice } from '../shared/labs/webPractice'
import { GenerationStatus } from './GenerationStatus'
import { requestCodingLab, labActivity, type DraftLab } from './draftLab'
import { labPayload } from './labPayload'
import type { Module } from './model'

export function DraftLabReview({ module, material, audience, additionalInstructions, selected, onChange, onBusy }: {
  module: Module; material: string; audience: string; additionalInstructions: string; selected: DraftLab | null
  onChange: (lab: DraftLab | null) => void; onBusy: (busy: boolean) => void
}) {
  const [lessonId, setLessonId] = useState(() => module.lessons.at(-1)?.id ?? '')
  const [stage, setStage] = useState<GenerationStage>('preparing')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [solution, setSolution] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function generate() {
    const lesson = module.lessons.find(item => item.id === lessonId)
    if (request.current || !lesson) return
    const controller = new AbortController()
    request.current = controller
    setError('')
    setStage('preparing')
    setWorking(true)
    onBusy(true)
    const input: CodingLabRequest = {
      kind: 'coding_lab', moduleTitle: module.title, lessonTitle: lesson.title, audience, material, additionalInstructions,
      lessons: module.lessons.map(item => ({ title: item.title, article: item.activities.filter(activity => activity.type === 'content')
        .map(activity => `## ${activity.title}\n\n${activity.markdown}`).join('\n\n') })),
    }
    try {
      const result = await requestCodingLab(input, controller.signal, setStage)
      controller.signal.throwIfAborted()
      if (!result.lab) {
        setError(result.reviewNotes.join(' ') || 'Sol could not find an HTML/CSS goal for this lab.')
        return
      }
      setStage('validating')
      const { html, css } = result.lab.solution
      const checks = await checkWebPractice(html, css, result.lab.checks, controller.signal)
      if (checks.some(check => !check.passed)) throw new Error('The reference solution did not pass all its checks. Try generating again.')
      if (!controller.signal.aborted) {
        setSolution(false)
        onChange({ lessonId, lab: result.lab, reviewNotes: result.reviewNotes })
      }
    } catch (problem) {
      if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'Could not generate a lab.')
    } finally {
      if (request.current === controller) {
        request.current = null
        setWorking(false)
        onBusy(false)
      }
    }
  }

  function reset() {
    request.current?.abort()
    request.current = null
    setWorking(false)
    onBusy(false)
  }

  function preview(lab: DraftCodingLab) {
    const activity = labActivity(lab)
    const payload = labPayload(activity)
    return solution ? { ...payload, starter_code: lab.solution.html, lab: { ...payload.lab, starterCss: lab.solution.css } } : payload
  }

  return <section className="ic-stack ic-draft-lab" aria-label="Coding lab review">
    {selected ? <>
      <h3>{selected.lab.title}</h3>
      <p className="ic-note">Test edits stay in this preview. The module draft keeps the original starter files.</p>
      {selected.reviewNotes.length > 0 && <ul>{selected.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      <div className="ic-row" role="group" aria-label="Preview files">
        <button className="ic-button" type="button" aria-pressed={!solution} onClick={() => setSolution(false)}>Try starter</button>
        <button className="ic-button" type="button" aria-pressed={solution} onClick={() => setSolution(true)}>Try reference solution</button>
      </div>
      <CodeLab key={solution ? 'solution' : 'starter'} payload={preview(selected.lab)} />
      <button className="ic-link-button ic-fit" type="button" onClick={() => onChange(null)}>Remove coding lab</button>
    </> : <>
      <label>Lab lesson<select value={lessonId} disabled={working} onChange={event => setLessonId(event.target.value)}>
        {module.lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
      </select></label>
      {!working && <button className="ic-button ic-fit" type="button" disabled={!lessonId} onClick={() => void generate()}>Add a coding lab</button>}
    </>}
    {working && <>
      <GenerationStatus stage={stage} title="Building your coding lab with Sol" />
      <button className="ic-link-button ic-fit" type="button" onClick={reset}>Cancel lab generation</button>
    </>}
    {error && <p className="ic-error" role="alert">{error}</p>}
  </section>
}
