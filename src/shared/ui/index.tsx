// Shared UI kit. Owner: Aryan. Add components here instead of copying styles.
// Styled to the Coding in Color brand guidelines (tokens in src/index.css).
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:bg-brand-dark',
  secondary: 'bg-white text-brand border border-brand hover:bg-brand-tint',
  ghost: 'text-brand hover:bg-brand-tint',
  danger: 'bg-white text-danger border border-danger hover:bg-danger-soft',
}
const sizeStyles: Record<ButtonSize, string> = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4' }

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold disabled:opacity-50 [&_svg]:size-4 ${buttonStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  )
}


export function Card({
  title,
  description,
  action,
  children,
  className = '',
  id,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={`soft-card scroll-mt-20 rounded-2xl border border-divider bg-white p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-cic-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-cic-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

/** Placeholder so every route renders something while it is being built. */
export function TodoPanel({ owner, items }: { owner: string; items: string[] }) {
  return (
    <Card title={`To build (owner: ${owner})`}>
      <ul className="list-disc space-y-1 pl-5 text-cic-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  )
}

// ---- Status & numbers ------------------------------------------------------

type Tone = 'neutral' | 'brand' | 'info' | 'warn' | 'danger' | 'success'
const toneStyles: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-cic-muted',
  brand: 'bg-brand-tint text-brand',
  info: 'bg-info-soft text-info',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-brand-tint text-brand',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5 ${toneStyles[tone]}`}>
      {children}
    </span>
  )
}

/** One headline number. `hint` explains the metric in plain words. */
export function StatTile({ label, value, hint, trend, change }: {
  label: string
  value: string
  hint?: string
  /** Oldest → newest values for a sparkline. */
  trend?: number[]
  /** Difference vs the previous week; the sign is shown as text, not only color. */
  change?: number | null
}) {
  return (
    <div className="soft-card relative flex flex-col gap-1 overflow-hidden rounded-2xl border border-divider bg-white p-5">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand to-brand-accent" />
      <p className="text-sm font-semibold text-cic-muted">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {trend && <Sparkline values={trend} label={`${label}, last ${trend.length} weeks`} />}
      </div>
      {change != null && (
        <p className={`text-xs font-bold ${change >= 0 ? 'text-brand' : 'text-danger'}`}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change)} <span className="font-normal text-cic-muted">{change >= 0 ? 'more' : 'fewer'} than last week</span>
        </p>
      )}
      {hint && <p className="text-xs text-cic-muted">{hint}</p>}
    </div>
  )
}

/** Tiny trend line. Values are announced to screen readers. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 76 + 2},${30 - (v / max) * 26}`)
  return (
    <svg viewBox="0 0 80 32" className="h-8 w-20 shrink-0" role="img" aria-label={`${label}: ${values.join(', ')}`}>
      <polygon points={`2,32 ${pts.join(' ')} 78,32`} fill="#e6f4ed" />
      <polyline points={pts.join(' ')} fill="none" stroke="#007a3d" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts.at(-1)!.split(',')[0]} cy={pts.at(-1)!.split(',')[1]} r="2.5" fill="#00a850" />
    </svg>
  )
}

/** Use whenever a list or chart has no data: say why, and give the next step. */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-cic-gray bg-white px-6 py-10 text-center">
      {icon && <div aria-hidden="true" className="text-cic-muted [&_svg]:size-8">{icon}</div>}
      <p className="font-semibold text-brand">{title}</p>
      {description && <p className="max-w-sm text-sm text-cic-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Progress bar that always shows the number as text too (never color alone). */
export function Meter({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <span className="text-cic-muted">—</span>
  const v = Math.round(value)
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-divider" role="img" aria-label={`${label}: ${v}%`}>
        <div className="h-full rounded-full bg-brand-accent" style={{ width: `${v}%` }} />
      </div>
      <span className="tabular-nums">{v}%</span>
    </div>
  )
}

// ---- Tables ----------------------------------------------------------------

/** Captioned table; scrolls sideways inside itself on phones. Brand: dark-green header, tinted alternate rows. */
export function DataTable({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="soft-card relative overflow-x-auto rounded-2xl border border-divider bg-white" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[560px] border-collapse text-left text-sm [&_tbody_tr:nth-child(even)]:bg-brand-subtle">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}
export function Th({ className = '', ...p }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={`bg-brand px-4 py-3 text-xs font-bold uppercase tracking-wide text-white ${className}`} {...p} />
}
export function Td({ className = '', ...p }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`border-b border-divider px-4 py-3 align-middle ${className}`} {...p} />
}

// ---- Forms -----------------------------------------------------------------

// No fixed width: controls stretch inside Field (flex column) and take the width a page sets elsewhere.
const control = 'h-11 rounded-lg border border-input bg-white px-3 text-sm placeholder:text-cic-muted'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${control} ${props.className ?? ''}`} />
}

/** Label + control + optional hint, wired together for screen readers. */
export function Field({ id, label, hint, optional, children }: { id: string; label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label} {optional && <span className="font-normal text-cic-muted">(optional)</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-cic-muted">{hint}</p>}
    </div>
  )
}

/** Inline result of a form action, announced to screen readers. */
export function FormStatus({ error, success, children }: { error?: string | null; success?: string | null; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {success && (
        <div className="flex flex-col gap-2 rounded-lg bg-brand-tint px-3 py-2 text-sm text-brand">
          <p>{success}</p>
          {children}
        </div>
      )}
    </div>
  )
}
