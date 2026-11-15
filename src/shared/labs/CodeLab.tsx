import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { CodePayload, CodingLabSettings } from '../types/activities.ts'
import { InteractiveHtmlFrame } from '../ui/InteractiveHtmlFrame.tsx'
import { checkPython, checkWeb, type CheckResult } from './checks.ts'
import { runPython, type PythonResult } from './pythonRunner.ts'
import './lab.css'

const Editor = lazy(() => import('../ui/SourceEditor.tsx').then(module => ({ default: module.SourceEditor })))
export type LabFiles = { source: string; css: string }
export type LabSubmission = { files: LabFiles; checks: CheckResult[]; submittedAt: string; passed: boolean }
type LabWork = { files: LabFiles; submission?: LabSubmission }

function loadWork(key: string | undefined, starter: LabFiles): LabWork {
  if (key) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      if (typeof saved?.files?.source === 'string' && typeof saved.files.css === 'string') return saved
    } catch { /* Use the starter when local storage is unavailable. */ }
  }
  return { files: starter }
}

export function CodeLab({ payload, storageKey, enabled = true }: {
  payload: CodePayload; storageKey?: string; enabled?: boolean
}) {
  const lab: CodingLabSettings = payload.lab ?? { language: 'python', checks: [] }
  const web = lab.language === 'web'
  const starter = { source: payload.starter_code, css: lab.starterCss ?? '' }
  const [work, setWork] = useState(() => loadWork(storageKey, starter))
  const [file, setFile] = useState<'source' | 'css'>('source')
  const [rendered, setRendered] = useState<LabFiles | null>(null)
  const [output, setOutput] = useState<PythonResult | null>(null)
  const [checks, setChecks] = useState<CheckResult[] | null>(null)
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const [storageError, setStorageError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const reset = useRef<HTMLDialogElement>(null)

  useEffect(() => () => controller.current?.abort(), [])

  function save(next: LabWork, isSubmission = false) {
    if (!isSubmission) setWork(next)
    if (!storageKey) return true
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      if (isSubmission) setWork(next)
      setStorageError('')
      return true
    } catch {
      setStorageError('Browser storage is unavailable. Your edits are still in this editor.')
      return false
    }
  }

  function change(text: string) {
    setChecks(null)
    setStatus('')
    save({ ...work, files: { ...work.files, [file]: text } })
  }

  async function execute(action: 'run' | 'check' | 'submit') {
    if (!enabled || controller.current) return
    const files = work.files
    if (files.source.length > 48_000 || files.css.length > 48_000) {
      setStatus('Keep each source file within 48,000 characters.')
      return
    }
    const running = new AbortController()
    controller.current = running
    setBusy(web ? 'Updating preview…' : 'Loading Python…')
    setStatus('')
    setOutput(null)
    setChecks(null)
    try {
      let results: CheckResult[] = []
      let successful = true
      if (web) {
        setRendered(files)
        if (action !== 'run') results = checkWeb(lab, files.source)
      } else {
        const result = await runPython(files.source, running.signal, () => setBusy('Running Python…'))
        setOutput(result)
        successful = !result.error
        if (action !== 'run') results = checkPython(lab, result.stdout, result.error)
      }
      if (action !== 'run') setChecks(results)
      if (action === 'submit') {
        const passed = successful && results.every(result => result.passed)
        const saved = save({ files, submission: { files, checks: results, passed, submittedAt: new Date().toISOString() } }, true)
        if (saved) setStatus(passed ? 'Submission saved. Lab complete.' : 'Submission saved. Review the results and try again.')
      } else if (action === 'check' && !results.length) {
        setStatus('There are no practice checks for this lab.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setStatus('Execution stopped.')
      else setStatus('The lab could not run. Try again.')
    } finally {
      if (controller.current === running) controller.current = null
      setBusy('')
    }
  }

  return <section className="cic-lab" aria-label="Coding lab">
    {payload.prompt && <p className="cic-lab-prompt">{payload.prompt}</p>}
    <div className="cic-lab-split">
      <div inert={!!busy}>
        <div className="cic-lab-tabs" role="group" aria-label="Starter files">
          <button type="button" aria-pressed={file === 'source'} onClick={() => setFile('source')}>{web ? 'index.html' : 'main.py'}</button>
          {web && <button type="button" aria-pressed={file === 'css'} onClick={() => setFile('css')}>styles.css</button>}
        </div>
        <Suspense fallback={<p role="status">Loading code editor…</p>}><Editor
          label={file === 'css' ? 'CSS code' : web ? 'HTML code' : 'Python code'}
          language={file === 'css' ? 'css' : web ? 'html' : 'python'} value={work.files[file]} onChange={change} /></Suspense>
      </div>
      <section className="cic-lab-output" aria-label={web ? 'Web preview' : 'Python output'}>
        <strong>{web ? 'Web preview' : 'Python output'}</strong>
        {web && rendered ? <InteractiveHtmlFrame html={rendered.source} css={rendered.css} title="Student page preview" height={285} />
          : <pre tabIndex={0}>{output ? output.stdout || (output.error ? '' : 'No printed output.') : busy || 'Run your code to see the result.'}</pre>}
        {output?.error && <pre className="cic-lab-error" role="alert">{output.error}</pre>}
      </section>
    </div>
    <div className="cic-lab-actions">
      <button type="button" disabled={!enabled || !!busy} onClick={() => void execute('run')}>Run</button>
      <button type="button" disabled={!enabled || !!busy} onClick={() => void execute('check')}>Check</button>
      {storageKey && <button type="button" className="cic-lab-primary" disabled={!enabled || !!busy} onClick={() => void execute('submit')}>Submit</button>}
      {busy && <button type="button" onClick={() => controller.current?.abort()}>Stop</button>}
      <button type="button" disabled={!!busy} onClick={() => reset.current?.showModal()}>Reset to starter</button>
    </div>
    {!enabled && <p>Runtime available in the local demo.</p>}
    {busy && <p role="status">{busy}</p>}
    {status && <p role="status">{status}</p>}
    {storageError && <p role="alert">{storageError}</p>}
    {checks && checks.length > 0 && <ul aria-label="Practice check results">
      {checks.map((result, index) => <li key={index}><strong>{result.passed ? 'Passed' : 'Needs work'}</strong> · {result.name}{result.detail && <p>{result.detail}</p>}</li>)}
    </ul>}
    {work.submission && <p>{work.submission.passed ? 'Last submission passed.' : 'Last submission needs work.'}</p>}
    <dialog className="cic-lab-dialog" ref={reset} aria-label="Reset lab">
      <p>Replace your current edits with the instructor’s starter files?</p>
      <form method="dialog" className="cic-lab-actions">
        <button autoFocus>Cancel</button>
        <button onClick={() => { save({ ...work, files: starter }); setChecks(null); setRendered(null); setOutput(null); setStatus('Starter files restored.') }}>Reset files</button>
      </form>
    </dialog>
  </section>
}
