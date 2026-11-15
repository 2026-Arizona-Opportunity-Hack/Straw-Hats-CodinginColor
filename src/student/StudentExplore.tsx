// Owner: Jacky. Browse subjects: pick a language, then a course.
import { useQuery } from '@tanstack/react-query'
import { useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listCatalog } from '../api/student/index.ts'
import { ALL_LANGUAGES, languageOf } from './languages.ts'
import { withShowcase } from './showcase.ts'
import './student.css'

export function StudentExplore() {
  const [params] = useSearchParams()
  const [open, setOpen] = useState(params.get('lang') ?? '')
  const { data: catalog = [], isLoading, isError } = useQuery({ queryKey: ['catalog'], queryFn: listCatalog })
  const courses = withShowcase(catalog)

  return (
    <>
      <header className="st-banner px-6 py-12 text-center sm:py-14">
        <h1 className="text-3xl font-bold sm:text-4xl" style={{ color: '#fff' }}>Browse subjects</h1>
        <p className="mt-2 text-white/85">Pick a subject to see its courses.</p>
      </header>

      <h2 className="mt-10 mb-4 text-xl font-bold" style={{ color: '#14181a' }}>All subjects</h2>
      {isLoading && <p role="status">Loading…</p>}
      {isError && <p role="alert">Could not load subjects. Try reloading.</p>}
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_LANGUAGES.map((l) => {
          const list = courses.filter((c) => languageOf(c.title).key === l.key)
          const expanded = open === l.key
          return (
            <div key={l.key} className="rounded-2xl bg-white" style={{ '--hue': l.hue, '--tint': l.tint } as CSSProperties}>
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : l.key)}
                className="flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:bg-canvas">
                <span className="st-tile size-10" aria-hidden="true"><img src={l.logo} alt="" className="size-6" /></span>
                <span className="flex-1 font-semibold">{l.key}</span>
                <span aria-hidden="true" className={`text-cic-muted transition ${expanded ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {expanded && (
                <ul className="px-2 pb-2">
                  {list.length ? list.map((c) => (
                    <li key={c.id}>
                      <Link to={`/student/course/${c.id}`} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-[var(--tint)]">
                        {c.title}<span aria-hidden="true" className="text-cic-muted">›</span>
                      </Link>
                    </li>
                  )) : <li className="px-3 py-2.5 text-cic-muted">Courses coming soon</li>}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
