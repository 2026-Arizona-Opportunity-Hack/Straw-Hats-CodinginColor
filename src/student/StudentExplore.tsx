// Owner: Jacky (card grid and course preview: Shivraj). Browse every course as a card; a card
// opens a preview with its modules and the way in: add it, join with a class code, or open it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { enrollInCourse, listCatalog, listCatalogModules, listMyCourses, type CatalogCourse, type CatalogModule } from '../api/student/index.ts'
import { joinClass } from '../api/student/auth.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { ALL_LANGUAGES, languageOf } from './languages.ts'
import { isShowcase, withShowcase } from './showcase.ts'
import './student.css'
import './explore.css'

const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }
const blurb = (c: CatalogCourse) => c.description?.trim() || `Learn ${languageOf(c.title).key} step by step with short readings, quick questions and hands-on practice.`

export function StudentExplore() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const lang = params.get('lang') ?? ''
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const { data: catalog = [], isLoading, isError } = useQuery({ queryKey: ['catalog'], queryFn: listCatalog })
  const { data: modules = [] } = useQuery({ queryKey: ['catalogModules'], queryFn: listCatalogModules })
  const { data: mine = [] } = useQuery({ queryKey: ['myCourses', profile?.id], queryFn: listMyCourses })

  const courses = withShowcase(catalog)
  const byCourse = useMemo(() => {
    const map = new Map<string, CatalogModule[]>()
    for (const m of modules) map.set(m.course_id, [...(map.get(m.course_id) ?? []), m])
    return map
  }, [modules])
  /** The student's own copy of a course: the same id, or their class's copy (same title). */
  const mineFor = (c: CatalogCourse) => mine.find((m) => m.id === c.id) ?? mine.find((m) => m.title === c.title)
  const languages = ALL_LANGUAGES.filter((l) => courses.some((c) => languageOf(c.title).key === l.key))
  const q = search.trim().toLowerCase()
  const shown = courses
    .filter((c) => !lang || languageOf(c.title).key === lang)
    .filter((c) => !q || c.title.toLowerCase().includes(q) || blurb(c).toLowerCase().includes(q))
    .sort((a, b) => Number(isShowcase(a.id)) - Number(isShowcase(b.id)))
  const openCourse = courses.find((c) => c.id === openId)
  const pick = (key: string) => setParams(key ? { lang: key } : {}, { replace: true })

  return (
    <>
      <header className="st-banner px-6 py-12 text-center sm:py-14">
        <h1 className="text-3xl font-bold sm:text-4xl" style={{ color: '#fff' }}>Explore courses</h1>
        <p className="mt-2 text-lg text-white/85">Open a course to see what you'll learn, then add it to your courses.</p>
        <label htmlFor="explore-search" className="sr-only">Search courses</label>
        <input id="explore-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses…"
          className="mx-auto mt-6 block h-12 w-full max-w-md rounded-full border-0 bg-white px-5 text-black shadow-lg outline-none focus:ring-4 focus:ring-[#9fe0bd]" />
      </header>

      <div role="group" aria-label="Filter by subject" className="mt-8 flex flex-wrap gap-2">
        {[{ key: '', label: 'All' }, ...languages.map((l) => ({ key: l.key, label: l.key }))].map((chip) => (
          <button key={chip.key} type="button" aria-pressed={lang === chip.key} onClick={() => pick(chip.key)} className="ex-chip">
            {chip.label}
          </button>
        ))}
      </div>

      {isLoading && <p role="status" className="mt-6">Loading courses…</p>}
      {isError && <p role="alert" className="mt-6">Could not load courses. Try reloading.</p>}
      {!isLoading && !shown.length && <p className="mt-6 text-cic-muted">No courses match. Try another subject or search.</p>}

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c, i) => {
          const l = languageOf(c.title)
          const count = byCourse.get(c.id)?.length ?? 0
          const soon = isShowcase(c.id)
          const added = mineFor(c)
          return (
            <li key={c.id} className="ex-card-in" style={{ '--i': i } as CSSProperties}>
              <button type="button" onClick={() => setOpenId(c.id)} aria-haspopup="dialog"
                className={`ex-card group flex h-full w-full flex-col rounded-3xl bg-white p-6 text-left ${soon ? 'opacity-80' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="ex-logo grid size-14 place-items-center rounded-2xl" aria-hidden="true"><img src={l.logo} alt="" className="size-8" /></span>
                  {added ? <span className="ex-badge bg-brand text-white">✓ Added</span>
                    : soon ? <span className="ex-badge bg-canvas text-cic-muted">Coming soon</span>
                    : c.delivery_mode === 'instructor_led' ? <span className="ex-badge bg-brand-tint text-brand">With a class</span>
                    : <span className="ex-badge bg-brand-tint text-brand">Self-paced</span>}
                </div>
                <h2 className="mt-4 text-xl font-bold leading-snug text-black">{c.title}</h2>
                <p className="mt-2 line-clamp-3 flex-1 text-[15px] text-cic-muted">{blurb(c)}</p>
                <div className="mt-5 flex items-center justify-between border-t border-divider pt-4 text-sm font-semibold">
                  <span className="text-cic-muted">{LEVEL[c.level ?? ''] ?? l.key}{count ? ` · ${count} module${count === 1 ? '' : 's'}` : ''}</span>
                  <span className="text-brand transition-transform group-hover:translate-x-1" aria-hidden="true">View →</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {openCourse && (
        <CoursePreview course={openCourse} modules={byCourse.get(openCourse.id) ?? []} mine={mineFor(openCourse)?.id}
          onClose={() => setOpenId(null)} />
      )}
    </>
  )
}

function CoursePreview({ course, modules, mine, onClose }: {
  course: CatalogCourse; modules: CatalogModule[]; mine?: string; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const l = languageOf(course.title)
  const soon = isShowcase(course.id)
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['myCourses'] }) }
  const enroll = useMutation({ mutationFn: () => enrollInCourse(course.id), onSuccess: refresh })
  const join = useMutation({ mutationFn: () => joinClass(code.trim()), onSuccess: refresh })
  const submit = (e: FormEvent) => { e.preventDefault(); if (code.trim()) join.mutate() }

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
    return () => d?.close()
  }, [])

  const openLink = (id: string, label: string) => (
    <Link to={`/student/course/${id}`} className="ex-cta">{label}</Link>
  )
  let action
  if (mine) action = openLink(mine, 'Open course →')
  else if (enroll.isSuccess) action = <>{openLink(course.id, 'Start learning →')}<p role="status" className="ex-pop font-semibold text-brand">✓ Added to My courses</p></>
  else if (join.isSuccess) action = <p role="status" className="ex-pop font-semibold text-brand">✓ You joined {join.data.class_name}. Find it under My courses.</p>
  else if (soon) action = <p className="font-semibold text-cic-muted">Coming soon. Check back later!</p>
  else if (course.delivery_mode === 'self_paced') action = <>
    <button type="button" onClick={() => enroll.mutate()} disabled={enroll.isPending} className="ex-cta">{enroll.isPending ? 'Adding…' : '+ Add course'}</button>
    {enroll.isError && <p role="alert" className="text-sm text-warn">{enroll.error.message}</p>}
  </>
  else action = <form onSubmit={submit} className="w-full">
    <label htmlFor="preview-code" className="mb-2 block text-sm font-semibold">This course runs with a class. Enter your class code:</label>
    <div className="flex gap-2">
      <input id="preview-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CLASS CODE" autoComplete="off"
        className="h-12 min-w-0 flex-1 rounded-xl border border-divider px-4 font-mono tracking-widest outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
      <button type="submit" disabled={join.isPending || !code.trim()} className="ex-cta">{join.isPending ? 'Joining…' : 'Join'}</button>
    </div>
    {join.isError && <p role="alert" className="mt-2 text-sm text-warn">{join.error.message}</p>}
  </form>

  return (
    <dialog ref={dialog} aria-labelledby="preview-title" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}
      className="ex-dialog m-auto w-[min(640px,calc(100vw-32px))] overflow-hidden rounded-3xl bg-white p-0 text-black">
      <div className="max-h-[85vh] overflow-y-auto">
        <header className="st-banner rounded-none p-6 sm:p-8">
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close"
            className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full text-xl text-white hover:bg-white/15">✕</button>
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white" aria-hidden="true"><img src={l.logo} alt="" className="size-8" /></span>
            <div>
              <p className="text-sm font-semibold text-white/80">{l.key}{course.level ? ` · ${LEVEL[course.level] ?? course.level}` : ''} · {course.delivery_mode === 'instructor_led' ? 'With a class' : 'Self-paced'}</p>
              <h2 id="preview-title" className="text-2xl font-bold sm:text-3xl" style={{ color: '#fff' }}>{course.title}</h2>
            </div>
          </div>
        </header>
        <div className="p-6 sm:p-8">
          <p className="text-[17px] leading-relaxed">{blurb(course)}</p>
          <h3 className="mt-6 text-sm font-bold uppercase tracking-widest text-brand">What you'll learn</h3>
          {modules.length ? (
            <ol className="mt-3 space-y-2">
              {modules.map((m, i) => (
                <li key={i} className="ex-mod flex items-center gap-3 rounded-xl bg-canvas px-4 py-3" style={{ '--i': i } as CSSProperties}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
                  <span className="font-semibold">{m.title}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-3 text-cic-muted">{soon ? 'Modules are being written.' : 'Modules will appear here once they are published.'}</p>}
        </div>
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-divider bg-white p-5 sm:px-8">{action}</footer>
      </div>
    </dialog>
  )
}
