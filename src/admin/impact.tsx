// Owner: Aryan. Visual building blocks for the Impact page (donor- and staff-facing).
// Colors: status palette validated with the dataviz checker; every segment also has a count/label.
import { useEffect, useState } from 'react'
import type { Status } from './metrics.ts'

const STATUS_COLOR: Record<Status, string> = {
  done: '#007a3d',
  on_track: '#2a78d6',
  not_started: '#c98500',
  stuck: '#b3261e',
}
const STATUS_LABEL: Record<Status, string> = {
  done: 'Completed',
  on_track: 'On track',
  not_started: 'Not started',
  stuck: 'Stuck',
}
const ORDER: Status[] = ['done', 'on_track', 'not_started', 'stuck']

/** Counts up to `value` once (skipped for people who prefer reduced motion). */
function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = requestAnimationFrame(() => setShown(value))
      return () => cancelAnimationFrame(id)
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      setShown(value * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

/** Big headline number for the impact band. Screen readers get the final value immediately. */
export function ImpactNumber({ value, label, hint, format = (v) => Math.round(v).toLocaleString() }: {
  value: number
  label: string
  hint?: string
  format?: (v: number) => string
}) {
  const shown = useCountUp(value)
  return (
    <div className="dot-hover rounded-xl bg-white/[0.08] p-4 ring-1 ring-white/15 backdrop-blur-sm transition-colors [--dot:rgb(255_255_255/0.22)] hover:bg-white/[0.12]">
      <p className="text-4xl font-bold tracking-tight text-white" aria-hidden="true">{format(shown)}</p>
      <p className="sr-only">{format(value)}</p>
      <p className="mt-1 font-semibold text-white">{label}</p>
      {hint && <p className="text-xs text-sidebar-muted">{hint}</p>}
    </div>
  )
}

export interface Segment {
  label: string
  count: number
  color: string
  /** Text color on the segment; dark on light fills so counts stay readable. */
  ink?: string
}

/** 100% stacked bar with counts inside wide-enough segments. Always pair with a legend. */
export function SegmentBar({ segments, label, tall }: { segments: Segment[]; label: string; tall?: boolean }) {
  const shown = segments.filter((s) => s.count > 0)
  const total = shown.reduce((n, s) => n + s.count, 0)
  if (!total) return <p className="text-sm text-cic-muted">Nothing to show yet</p>
  return (
    <div
      className={`flex w-full gap-0.5 overflow-hidden rounded-md ${tall ? 'h-11 rounded-lg text-sm' : 'h-7 text-xs'}`}
      role="img"
      aria-label={`${label}: ${shown.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')}`}
    >
      {shown.map((s) => (
        <div
          key={s.label}
          title={`${s.label}: ${s.count}`}
          className="grid place-items-center font-bold"
          style={{ width: `${(s.count / total) * 100}%`, background: `linear-gradient(135deg, color-mix(in srgb, ${s.color} 70%, white), ${s.color} 60%)`, boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.35)', color: s.ink ?? '#fff' }}
        >
          {s.count / total >= 0.08 ? s.count : ''}
        </div>
      ))}
    </div>
  )
}

const statusSegments = (counts: Record<Status, number>): Segment[] =>
  ORDER.map((k) => ({ label: STATUS_LABEL[k], count: counts[k], color: STATUS_COLOR[k], ink: k === 'not_started' ? '#000' : undefined }))

export function StatusBar({ counts, label }: { counts: Record<Status, number>; label: string }) {
  return <SegmentBar segments={statusSegments(counts)} label={label} />
}

/** Overall picture: where every student stands, and how far through the modules they are. */
export function OverallProgress({ students, modules }: { students: Record<Status, number>; modules: { done: number; inProgress: number; notStarted: number } }) {
  const moduleSegments: Segment[] = [
    { label: 'Completed', count: modules.done, color: '#007a3d' },
    { label: 'In progress', count: modules.inProgress, color: '#2a78d6' },
    { label: 'Not started', count: modules.notStarted, color: '#e3e3e3', ink: '#000' },
  ]
  const rows = [
    { title: 'Students', segments: statusSegments(students) },
    { title: 'Modules', segments: moduleSegments },
  ]
  return (
    <div className="flex flex-col gap-6">
      {rows.map(({ title, segments }) => {
        const total = segments.reduce((n, s) => n + s.count, 0)
        return (
          <div key={title}>
            <p className="mb-2 flex justify-between font-semibold">
              <span>{title}</span>
              <span className="text-sm text-cic-muted">{total} total</span>
            </p>
            <SegmentBar segments={segments} label={title} tall />
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label={`${title} legend`}>
              {segments.map((s) => (
                <li key={s.label} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-3 rounded-sm ring-1 ring-black/10" style={{ background: s.color }} />
                  {s.label} <span className="font-semibold tabular-nums">{s.count}</span>
                  <span className="text-cic-muted">({total ? Math.round((s.count / total) * 100) : 0}%)</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function StatusLegend({ counts }: { counts?: Record<Status, number> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
      {ORDER.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm" style={{ background: STATUS_COLOR[k] }} />
          {STATUS_LABEL[k]}{counts && <span className="font-semibold tabular-nums">{counts[k]}</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * Before → after per module: a blue dot at the pretest average, a green dot at the post-test average,
 * joined by a bar. Reads instantly ("they moved this far") and every value is printed as text.
 */
export function GrowthRows({ rows }: { rows: { label: string; pre: number | null; post: number | null }[] }) {
  const usable = rows.filter((r) => r.pre != null && r.post != null)
  if (!usable.length) return <p className="text-sm text-cic-muted">Shows up once students take a pretest and a post-test.</p>
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-5">
        {usable.map((r) => {
          const pre = Math.round(r.pre!)
          const post = Math.round(r.post!)
          const lo = Math.min(pre, post)
          const hi = Math.max(pre, post)
          return (
            <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 sm:grid-cols-[12rem_1fr_auto]">
              <span className="truncate text-sm font-semibold">{r.label}</span>
              <div className="relative h-8" role="img" aria-label={`${r.label}: pretest ${pre}%, post-test ${post}%`}>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-divider" />
                <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#2a78d6] to-brand" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                <Dot pct={pre} color="#2a78d6" textColor="#1d5fa8" text={`${pre}%`} above={false} />
                <Dot pct={post} color="#007a3d" textColor="#007a3d" text={`${post}%`} above />
              </div>
              <span className="rounded-full bg-brand-tint px-2.5 py-1 text-sm font-bold tabular-nums text-brand">
                {post - pre >= 0 ? '+' : '−'}{Math.abs(post - pre)} pts
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-4 text-sm" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#2a78d6]" /> Pretest average (before)</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-brand" /> Post-test average (after)</span>
      </div>
    </div>
  )
}

function Dot({ pct, color, textColor, text, above }: { pct: number; color: string; textColor: string; text: string; above: boolean }) {
  return (
    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct}%` }} aria-hidden="true">
      <span className="block size-4 rounded-full border-2 border-white shadow" style={{ background: color }} />
      <span className={`absolute left-1/2 -translate-x-1/2 text-[11px] font-bold tabular-nums ${above ? '-top-4' : 'top-4'}`} style={{ color: textColor }}>
        {text}
      </span>
    </span>
  )
}

export type Pip = 'done' | 'in_progress' | 'not_started'
const PIP: Record<Pip, { cls: string; label: string }> = {
  done: { cls: 'bg-brand border-brand', label: 'completed' },
  in_progress: { cls: 'bg-[#2a78d6] border-[#2a78d6]', label: 'in progress' },
  not_started: { cls: 'bg-white border-cic-gray', label: 'not started' },
}

/** One dot per module, in course order: a student's learning journey at a glance. */
export function JourneyPips({ modules }: { modules: { title: string; state: Pip }[] }) {
  return (
    <ol className="flex items-center gap-1" aria-label={modules.map((m) => `${m.title}: ${PIP[m.state].label}`).join('; ')}>
      {modules.map((m, i) => (
        <li key={i} title={`${m.title}: ${PIP[m.state].label}`} className={`size-3.5 rounded-full border-2 ${PIP[m.state].cls}`} />
      ))}
    </ol>
  )
}

export function JourneyLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Module dots legend">
      {(Object.keys(PIP) as Pip[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-3.5 rounded-full border-2 ${PIP[k].cls}`} />
          Module {PIP[k].label}
        </li>
      ))}
    </ul>
  )
}
