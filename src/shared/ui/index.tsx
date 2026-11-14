// Shared UI kit. Owner: Aryan. Add components here instead of copying styles.
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
    </header>
  )
}

/** Placeholder so every route renders something while it is being built. */
export function TodoPanel({ owner, items }: { owner: string; items: string[] }) {
  return (
    <Card title={`To build (owner: ${owner})`}>
      <ul className="list-disc space-y-1 pl-5 text-slate-700">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  )
}
