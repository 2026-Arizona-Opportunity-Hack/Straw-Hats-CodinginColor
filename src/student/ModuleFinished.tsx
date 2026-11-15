// Owner: Shivraj. Shown on the course page right after "Finish module": how it went and what's next.
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { ModuleStatus } from '../api/student/index.ts'
import { Celebration } from './Celebration.tsx'

const pct = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100))

export function ModuleFinished({ modules, moduleId, hue, onClose }: {
  modules: ModuleStatus[]; moduleId: string; hue: string; onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const i = modules.findIndex((m) => m.module_id === moduleId)
  useEffect(() => { if (i >= 0) heading.current?.focus() }, [i])
  if (i < 0) return null

  const m = modules[i]
  const next = modules[i + 1]
  const passed = m.state === 'completed'
  const score = pct(m.posttest_best)
  const need = pct(m.pass_mark)
  const triesLeft = m.max_tries != null && m.posttest_tries != null ? Math.max(m.max_tries - m.posttest_tries, 0) : null
  const button = 'inline-flex min-h-11 items-center rounded-lg px-5 font-semibold text-white'

  let title: string, detail: string | null, action: { to: string; label: string } | null
  if (!passed) {
    title = `You finished every step of ${m.title}`
    detail = `Final check: ${score ?? 0}%. You need ${need ?? 70}% to open the next module.`
      + (triesLeft ? ` You have ${triesLeft} more ${triesLeft === 1 ? 'try' : 'tries'}. Review the lesson, then retake it.` : '')
    action = { to: `/student/module/${m.module_id}`, label: 'Retake the final check →' }
  } else if (!next) {
    title = 'You finished the whole course!'
    detail = score != null ? `Last final check: ${score}%.` : null
    action = { to: '/student/explore', label: 'Find your next course →' }
  } else {
    title = `You finished ${m.title}!`
    detail = score != null ? `Final check: ${score}%.` : null
    action = next.state === 'locked' ? null : { to: `/student/module/${next.module_id}`, label: `Start Module ${i + 2}: ${next.title} →` }
    if (!action) detail = (detail ? detail + ' ' : '') + 'The next module opens when your teacher releases it.'
  }

  return (
    <section role="status" aria-labelledby="module-finished" className="relative mt-6 overflow-hidden rounded-2xl border-2 bg-white p-6" style={{ borderColor: hue }}>
      {passed && <Celebration cheer={next ? 'Module complete!' : 'Course complete!'} />}
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 px-2 text-cic-muted hover:text-black">✕</button>
      <div className="flex items-start gap-4 pt-6">
        <span aria-hidden="true" className="sp-trophy text-4xl">{passed ? (next ? '🎉' : '🏆') : '💪'}</span>
        <div>
          <h2 id="module-finished" ref={heading} tabIndex={-1} className="text-xl font-bold focus:outline-none">{title}</h2>
          {detail && <p className="mt-1 text-cic-muted">{detail}</p>}
          {action && <Link to={action.to} className={`${button} mt-4`} style={{ background: hue }}>{action.label}</Link>}
        </div>
      </div>
    </section>
  )
}
