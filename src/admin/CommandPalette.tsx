// Owner: Aryan. ⌘K / Ctrl+K: jump to any page, class, person or school, or run a common action.
import { ArrowRight, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import type { Role } from '../shared/types/db.ts'
import { useOrg } from './hooks.ts'
import { archivedReason } from './metrics.ts'

interface Command {
  group: 'Pages' | 'Actions' | 'Classes' | 'People' | 'Schools'
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const { setPreviewRole } = useAuth()
  const { data } = useOrg(open)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
    trigger.current?.focus()
  }
  const go = (to: string) => () => navigate(to)
  const preview = (role: Role) => () => {
    setPreviewRole(role)
    navigate(`/${role}`)
  }

  const commands: Command[] = [
    { group: 'Pages', label: 'Overview', run: go('/admin') },
    { group: 'Pages', label: 'Schools & classes', run: go('/admin/classes') },
    { group: 'Pages', label: 'People & roles', run: go('/admin/users') },
    { group: 'Pages', label: 'Impact & learning', run: go('/admin/analytics') },
    { group: 'Pages', label: 'Settings & API', run: go('/admin/settings') },
    { group: 'Actions', label: 'Create a class', run: go('/admin/classes#new-class') },
    { group: 'Actions', label: 'Create an API key', run: go('/admin/settings#api-keys') },
    { group: 'Actions', label: 'View archived classes', run: go('/admin/classes?archived=1') },
    { group: 'Actions', label: 'Preview as Student', run: preview('student') },
    { group: 'Actions', label: 'Preview as Instructor', run: preview('instructor') },
    { group: 'Actions', label: 'Preview as External Reviewer', run: preview('reviewer') },
    ...(data?.classes ?? []).map((c) => {
      const archived = Boolean(archivedReason(c))
      return { group: 'Classes' as const, label: c.name, hint: archived ? 'archived' : c.school, run: go(`/admin/analytics?class=${c.id}${archived ? '&archived=1' : ''}`) }
    }),
    ...(data?.people ?? []).map((p) => ({ group: 'People' as const, label: p.display_name, hint: p.role, run: go(`/admin/users?q=${encodeURIComponent(p.display_name)}`) })),
    ...[...new Set(data?.classes.map((c) => c.school))].map((s) => ({ group: 'Schools' as const, label: s, run: go(`/admin/classes?school=${encodeURIComponent(s)}`) })),
  ]
  const q = query.trim().toLowerCase()
  const results = (q ? commands.filter((c) => `${c.label} ${c.hint ?? ''}`.toLowerCase().includes(q)) : commands.filter((c) => c.group !== 'People' && c.group !== 'Classes')).slice(0, 10)
  const runAt = (i: number) => {
    const cmd = results[i]
    if (!cmd) return
    close()
    cmd.run()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-10 w-full max-w-sm items-center gap-2 rounded-lg border border-divider bg-white px-3 text-sm text-cic-muted hover:border-brand"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded border border-divider bg-canvas px-1.5 text-xs font-semibold">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label="Search or jump to" className="soft-card w-full max-w-lg overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center gap-2 border-b-2 border-divider px-4 focus-within:border-brand">
              <Search aria-hidden="true" className="size-4 text-cic-muted" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="command-results"
                aria-activedescendant={results[active] ? `command-${active}` : undefined}
                aria-label="Search pages, classes, people, schools and actions"
                placeholder="Type a class, person, school or action…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close()
                  else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter') { e.preventDefault(); runAt(active) }
                }}
                className="h-14 flex-1 bg-transparent text-base focus-visible:outline-none"
              />
              <kbd className="rounded border border-divider px-1.5 text-xs text-cic-muted">Esc</kbd>
            </div>
            <ul id="command-results" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-cic-muted">Nothing matches “{query}”.</li>}
              {results.map((c, i) => (
                <li
                  key={`${c.group}-${c.label}-${i}`}
                  id={`command-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${i === active ? 'bg-brand-tint text-brand' : ''}`}
                >
                  <span className="w-16 shrink-0 text-xs font-bold uppercase tracking-wide text-cic-muted">{c.group}</span>
                  <span className="flex-1 font-semibold">{c.label}</span>
                  {c.hint && <span className="text-xs capitalize text-cic-muted">{c.hint}</span>}
                  {i === active && <ArrowRight aria-hidden="true" className="size-4" />}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
