// Card chrome for one lesson step, shared by the student player and the instructor previews.
import { createElement, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { activityKinds, type ActivityKind } from './lessonContent.ts'
import './lesson.css'

export function KindBadge({ kind }: { kind: ActivityKind }) {
  const { label, icon: Icon } = activityKinds[kind]
  return <span className={'cic-badge cic-badge--' + kind}><Icon aria-hidden="true" size={15} strokeWidth={2.25} />{label}</span>
}

/** Completion bar. The visible text carries the number, so the bar is never the only signal. */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const value = total ? Math.min(1, done / total) : 0
  return <div className="cic-progress">
    <div className="cic-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
      aria-valuetext={`${done} of ${total} done`}>
      <span className="cic-progress-fill" style={{ transform: `scaleX(${value})` }} />
    </div>
    <span className="cic-progress-text">{done} of {total} done</span>
  </div>
}

export function ActivityCard({ id, kind, title, step, total, minutes, done, headingLevel = 3, children }: {
  id?: string
  kind: ActivityKind
  title: string
  /** 1-based position in the lesson. */
  step?: number
  total?: number
  /** Estimated reading time, shown for reading steps. */
  minutes?: number
  done?: boolean
  headingLevel?: 2 | 3 | 4
  children: ReactNode
}) {
  const headingId = id ? id + '-title' : undefined
  const meta = [step && total ? `Step ${step} of ${total}` : '', minutes ? `${minutes} min read` : ''].filter(Boolean)
  return <section id={id} className={'cic-card cic-card--' + kind} aria-labelledby={headingId}>
    <header className="cic-card-head">
      <KindBadge kind={kind} />
      {meta.length > 0 && <span className="cic-card-meta">{meta.join(' · ')}</span>}
      {done && <span className="cic-done"><span className="cic-done-icon"><Check aria-hidden="true" size={14} strokeWidth={3} /></span>Done</span>}
    </header>
    {createElement('h' + headingLevel, { id: headingId, className: 'cic-card-title' }, title)}
    <div className="cic-card-body">{children}</div>
  </section>
}
