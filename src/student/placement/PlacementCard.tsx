// Owner: Shivraj. Student home card for the starter quiz.
// First visit (never taken, never skipped): sends the student to the quiz.
// Taken: shows the recommended course. Skipped: offers the quiz again.
import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getMyPlacement, placementAvailable } from '../../api/student/placement.ts'
import { useAuth } from '../../shared/auth/AuthContext.tsx'
import { languageOf } from '../languages.ts'

export function PlacementCard() {
  const { profile } = useAuth()
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['placement', profile?.id], queryFn: getMyPlacement, enabled: placementAvailable,
  })
  if (!placementAvailable || isLoading || isError) return null
  // Only redirect on a fresh answer: a cached "never taken" from before the quiz must not win.
  if (data === null) return isFetching ? null : <Navigate to="/student/start" replace />

  const course = data?.result?.course
  if (!course) {
    return (
      <section aria-label="Find your course" className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5">
        <div>
          <h2 className="st-serif text-2xl">Not sure where to start?</h2>
          <p className="text-sm text-cic-muted">Answer 12 quick questions and we'll suggest a course for you.</p>
        </div>
        <Link to="/student/start" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-dark">Find my course</Link>
      </section>
    )
  }

  const lang = languageOf(course.title)
  return (
    <section aria-labelledby="rec-card-h" className="mt-8 flex flex-wrap items-center gap-5 rounded-2xl bg-brand-tint p-5"
      style={{ '--hue': lang.hue, '--tint': lang.tint } as CSSProperties}>
      <span className="st-tile size-14 bg-white" aria-hidden="true"><img src={lang.logo} alt="" className="size-9" /></span>
      <div className="min-w-0 flex-1">
        <h2 id="rec-card-h" className="text-xs font-semibold uppercase tracking-widest text-brand">Recommended for you</h2>
        <p className="st-serif text-2xl leading-tight">{course.title}</p>
        {data.result?.reasons[0] && <p className="text-sm text-cic-muted">{data.result.reasons[0]}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/student/course/${course.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-dark">Open course</Link>
        <Link to="/student/explore" className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-brand hover:bg-white">Explore other courses</Link>
        <Link to="/student/start" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-cic-muted hover:bg-white hover:text-black">Retake quiz</Link>
      </div>
    </section>
  )
}
