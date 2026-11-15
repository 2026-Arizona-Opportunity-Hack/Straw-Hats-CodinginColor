// Owner: Jacky. One course: its modules as rows of step dots, with real progress.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { enrollInCourse, getModule, listActivityStatus, listCatalog, listModuleStatus, listMyCourses, type CatalogCourse } from '../api/student/index.ts'
import { joinClass } from '../api/student/auth.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import type { ActivityType } from '../shared/types/activities.ts'
import type { Activity } from '../shared/types/db.ts'
import { FormStatus, Input } from '../shared/ui/index.tsx'
import { languageOf } from './languages.ts'
import { ModuleFinished } from './ModuleFinished.tsx'
import { isShowcase, withShowcase } from './showcase.ts'
import './student.css'

const STEP: Record<ActivityType, { label: string; icon: string }> = {
  pretest: { label: 'Warm-up', icon: 'M5 21V4h11l-2 4 2 4H5' },
  video: { label: 'Video', icon: 'M8 5v14l11-7z' },
  content: { label: 'Reading', icon: 'M4 5h7v14H4zM13 5h7v14h-7z' },
  slides: { label: 'Slides', icon: 'M4 5h16v11H4zM12 16v4M8 20h8' },
  check: { label: 'Quick question', icon: 'M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7M12 17h.01' },
  worksheet: { label: 'Worksheet', icon: 'M4 20h4L19 9l-4-4L4 16z' },
  code: { label: 'Coding', icon: 'm8 8-4 4 4 4M16 8l4 4-4 4' },
  interactive_html: { label: 'Activity', icon: 'M12 3v4M12 17v4M3 12h4M17 12h4' },
  exit: { label: 'Exit ticket', icon: 'm5 12 5 5 9-10' },
  posttest: { label: 'Final check', icon: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z' },
}
const titleOf = (a: Activity) => (a.content as { title?: string }).title || a.concept || STEP[a.type].label

export function StudentCourse() {
  const { courseId = '' } = useParams()
  const { profile } = useAuth()
  const { data: catalog = [] } = useQuery({ queryKey: ['catalog'], queryFn: listCatalog })
  const { data: mine = [], isLoading } = useQuery({ queryKey: ['myCourses', profile?.id], queryFn: listMyCourses })
  const all = withShowcase(catalog)
  const course = mine.find((c) => c.id === courseId) ?? all.find((c) => c.id === courseId)
  const enrolled = mine.some((c) => c.id === courseId)
  const { data: modules } = useQuery({ queryKey: ['moduleStatus', profile?.id, courseId], queryFn: () => listModuleStatus(courseId), enabled: enrolled })
  const openModules = (modules ?? []).filter((m) => m.state !== 'locked')
  const contents = useQueries({ queries: openModules.map((m) => ({ queryKey: ['module', profile?.id, m.module_id], queryFn: () => getModule(m.module_id) })) })
  const statuses = useQueries({ queries: openModules.map((m) => ({ queryKey: ['moduleActivities', profile?.id, m.module_id], queryFn: () => listActivityStatus(m.module_id) })) })
  const [popover, setPopover] = useState<string | null>(null)
  // "Finish module" in the player lands here with the module id; keep it until the student closes the banner.
  const location = useLocation()
  const navigate = useNavigate()
  const finishedModule = (location.state as { finishedModule?: string } | null)?.finishedModule

  if (!course) return <p role="status">{isLoading ? 'Loading…' : <>This course isn't available. <Link className="underline" to="/student/explore">Browse subjects</Link></>}</p>
  const lang = languageOf(course.title)
  const siblings = all.filter((c) => languageOf(c.title).key === lang.key)
  const done = modules?.filter((m) => m.state === 'completed').length ?? 0
  const pct = modules?.length ? Math.round((done / modules.length) * 100) : 0
  const next = modules?.find((m) => m.state === 'available')

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]" style={{ '--hue': lang.hue, '--tint': lang.tint } as CSSProperties}>
      <nav aria-label={`${lang.key} courses`} className="lg:sticky lg:top-6 lg:self-start">
        {/* Back goes where the student came from: their courses once they've added it, else Explore. */}
        <Link to={enrolled ? '/student/courses' : `/student/explore?lang=${encodeURIComponent(lang.key)}`} className="mb-3 flex items-center gap-2 font-semibold text-cic-muted hover:text-black">‹ {enrolled ? 'My courses' : 'Browse subjects'}</Link>
        <p className="mb-2 px-3 text-xs font-bold uppercase tracking-widest text-cic-muted">{lang.key}</p>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {siblings.map((c) => (
            <li key={c.id}>
              <Link to={`/student/course/${c.id}`} aria-current={c.id === courseId ? 'page' : undefined}
                className="block whitespace-nowrap rounded-xl px-3 py-2 hover:bg-white aria-[current=page]:bg-[var(--tint)] aria-[current=page]:font-semibold lg:whitespace-normal">{c.title}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <header className="st-banner p-7 sm:p-9" style={{ background: '#0b3d23' }}>
          <span className="st-leaf" aria-hidden="true" /><span className="st-leaf" aria-hidden="true" />
          <div className="max-w-md">
            <img src={lang.logo} alt="" className="mb-4 size-11 rounded-xl bg-white p-1.5" />
            <h1 className="text-3xl font-bold sm:text-4xl" style={{ color: '#fff' }}>{course.title}</h1>
            <p className="mt-2 line-clamp-2 text-white/85">{course.description}</p>
            <div className="mt-6"><Action course={course} enrolled={enrolled} nextModuleId={next?.module_id} /></div>
          </div>
        </header>

        {enrolled && modules && finishedModule && (
          <ModuleFinished modules={modules} moduleId={finishedModule} hue={lang.hue}
            onClose={() => navigate(location.pathname, { replace: true, state: null })} />
        )}

        {enrolled && modules && (
          <section className="mt-6 rounded-2xl bg-white p-6" aria-label="Your progress">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-bold">Your progress <span className="ml-1 rounded-md px-2 py-0.5 text-sm" style={{ background: lang.tint, color: lang.hue }}>{pct}%</span></p>
                <p className="text-sm text-cic-muted">{done} of {modules.length} modules complete</p>
              </div>
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: lang.hue }} /></div>
            </div>

            <ol className="mt-6 space-y-6">
              {modules.map((m, i) => {
                const k = openModules.findIndex((o) => o.module_id === m.module_id)
                const acts = k < 0 ? [] : contents[k]?.data?.lessons.flatMap((l) => l.activities) ?? []
                const submitted = new Set((k < 0 ? [] : statuses[k]?.data ?? []).filter((s) => s.submitted).map((s) => s.activity_id))
                const firstOpen = acts.find((a) => a.type !== 'content' && !submitted.has(a.id))?.id
                return (
                  <li key={m.module_id}>
                    <p className="mb-2 font-semibold">Module {i + 1}: {m.title}{m.tested_out && <span className="ml-2 text-sm font-normal text-cic-muted">· skipped ahead</span>}</p>
                    {m.state === 'locked' ? (
                      <p className="text-sm text-cic-muted">🔒 Opens when you finish the module before.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {acts.map((a, stepIndex) => {
                          const done = a.type !== 'content' && submitted.has(a.id)
                          return <div key={a.id} className="relative">
                            <button type="button" aria-label={`${STEP[a.type].label}: ${titleOf(a)}${done ? ', done' : ''}`} aria-expanded={popover === a.id}
                              onClick={() => setPopover(popover === a.id ? null : a.id)}
                              className={`st-dot ${done ? 'done' : a.id === firstOpen ? 'next' : ''}`}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STEP[a.type].icon} /></svg>
                            </button>
                            {popover === a.id && (
                              <div role="dialog" aria-label={titleOf(a)} className="absolute left-0 top-11 z-20 w-64 rounded-xl bg-white p-4 shadow-[0_18px_40px_-14px_rgba(20,24,26,.35)]">
                                <button type="button" onClick={() => setPopover(null)} aria-label="Close" className="absolute right-2 top-2 px-2 text-cic-muted">✕</button>
                                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: lang.hue }}>{STEP[a.type].label}</p>
                                <p className="mt-1 font-semibold">{titleOf(a)}</p>
                                <Link to={`/student/module/${m.module_id}?step=${stepIndex + 1}`} className="mt-3 inline-block font-semibold" style={{ color: lang.hue }}>{done ? 'Review' : 'Go to content'} →</Link>
                              </div>
                            )}
                          </div>
                        })}
                        {!acts.length && <p className="text-sm text-cic-muted">Loading steps…</p>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

function Action({ course, enrolled, nextModuleId }: { course: CatalogCourse; enrolled: boolean; nextModuleId?: string }) {
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['myCourses'] })
  const enroll = useMutation({ mutationFn: () => enrollInCourse(course.id), onSuccess: refresh })
  const join = useMutation({ mutationFn: () => joinClass(code.trim()), onSuccess: refresh })
  const submit = (e: FormEvent) => { e.preventDefault(); if (code.trim()) join.mutate() }
  const light = 'bg-white text-[#0b3d23] hover:bg-white/90'

  if (enrolled) return nextModuleId
    ? <Link to={`/student/module/${nextModuleId}`} className={`inline-flex min-h-11 items-center rounded-lg px-5 font-semibold ${light}`}>Continue learning →</Link>
    : <p className="font-semibold text-white">In your courses</p>
  if (isShowcase(course.id)) return <p className="inline-block rounded-lg bg-white/15 px-4 py-2 font-semibold text-white">Coming soon</p>
  if (course.delivery_mode === 'self_paced') return (
    <>
      {/* Plain button: the shared Button's white text overrode the light style (white on white). */}
      <button type="button" onClick={() => enroll.mutate()} disabled={enroll.isPending}
        className={`inline-flex min-h-11 items-center rounded-lg px-5 font-semibold disabled:opacity-60 ${light}`}>
        {enroll.isPending ? 'Adding…' : 'Start learning →'}
      </button>
      <div className="mt-2 text-white"><FormStatus error={enroll.error?.message} /></div>
    </>
  )
  return (
    <form onSubmit={submit} className="max-w-sm">
      <label htmlFor="course-code" className="mb-2 block text-sm text-white/85">Join with your class code</label>
      <div className="flex gap-2">
        <Input id="course-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Class code" autoComplete="off" className="min-w-0 flex-1 font-mono tracking-widest" />
        <button type="submit" disabled={join.isPending} className={`min-h-11 rounded-lg px-5 font-semibold disabled:opacity-60 ${light}`}>Join</button>
      </div>
      <div className="mt-2"><FormStatus error={join.error?.message} /></div>
    </form>
  )
}
