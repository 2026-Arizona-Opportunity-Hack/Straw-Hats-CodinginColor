import { lazy, Suspense, useState } from 'react'
import type { CodingLabSettings } from '../shared/types/activities.ts'
import { CodeLab } from '../shared/labs/CodeLab'
import { isLocalDemo } from '../shared/supabase.ts'
import { labPayload } from './labPayload'
import type { Activity } from './model'
import { Dialog } from './ui'

const Editor = lazy(() => import('../shared/ui/SourceEditor.tsx').then(module => ({ default: module.SourceEditor })))

export function CodingLabEditor({ activity, onChange }: { activity: Activity; onChange: (code: NonNullable<Activity['code']>) => void }) {
  const payload = labPayload(activity)
  const config = payload.lab
  const webPractice = config.verifier === 'web-practice-v1'
  const [tryStarter, setTryStarter] = useState(false)
  const defaults = { starter: '', tests: '', solution: '', ...activity.code }
  const setLab = (lab: CodingLabSettings) => onChange({ ...defaults, lab })
  const changeLanguage = (language: CodingLabSettings['language']) => {
    if (language === config.language) return
    if (config.checks.length && !window.confirm('Changing languages clears the current practice checks. Continue?')) return
    setLab({ ...config, language, checks: [] })
  }
  return <div className="ic-stack">
    {!webPractice && <label>Language<select value={config.language} onChange={event => changeLanguage(event.target.value as CodingLabSettings['language'])}>
      <option value="python">Python</option><option value="web">HTML/CSS</option>
    </select></label>}
    <div><strong>{config.language === 'web' ? 'Starter HTML' : 'Starter Python'}</strong>
      <Suspense fallback={<p>Loading code editor…</p>}><Editor label="Starter code" language={config.language === 'web' ? 'html' : 'python'}
        value={payload.starter_code} onChange={starter => onChange({ ...defaults, starter, lab: config })} /></Suspense>
    </div>
    {config.language === 'web' && <div><strong>Starter CSS</strong>
      <Suspense fallback={<p>Loading code editor…</p>}><Editor label="Starter CSS" language="css" value={config.starterCss ?? ''}
        onChange={starterCss => setLab({ ...config, starterCss })} /></Suspense>
    </div>}
    {webPractice ? <section><h4>Practice checks</h4><ul>
      {config.checks.map((check, index) => <li key={index}>{check.name}</li>)}
    </ul></section> : <fieldset className="ic-stack"><legend>Practice checks</legend>
      <p className="ic-note">{config.language === 'python' ? 'Compare the printed output to the expected result.' : 'Check whether an element exists and optionally match its text.'}</p>
      {config.checks.map((check, index) => {
        const update = (patch: Partial<typeof check>) => setLab({ ...config, checks: config.checks.map((item, i) => i === index ? { ...item, ...patch } : item) })
        return <fieldset key={index} className="ic-stack"><legend>Check {index + 1}</legend>
          <label>Check name<input value={check.name} onChange={event => update({ name: event.target.value })} /></label>
          {config.language === 'web' && <label>CSS selector<input value={check.selector ?? ''} onChange={event => update({ selector: event.target.value })} placeholder="e.g. main h1" /></label>}
          <label>{config.language === 'web' ? 'Expected text (optional)' : 'Expected output'}<textarea rows={2} value={check.expected} onChange={event => update({ expected: event.target.value })} /></label>
          <button type="button" className="ic-link-button ic-fit" onClick={() => setLab({ ...config, checks: config.checks.filter((_, i) => i !== index) })}>Remove check</button>
        </fieldset>
      })}
      <button type="button" className="ic-button ic-fit" onClick={() => setLab({ ...config, checks: [...config.checks, { name: '', expected: '' }] })}>Add practice check</button>
    </fieldset>}
    <button type="button" className="ic-button ic-fit" onClick={() => setTryStarter(true)}>Try starter code</button>
    {tryStarter && <Dialog wide title="Try the coding lab" onClose={() => setTryStarter(false)}>
      <CodeLab payload={payload} enabled={isLocalDemo || webPractice} />
    </Dialog>}
  </div>
}
