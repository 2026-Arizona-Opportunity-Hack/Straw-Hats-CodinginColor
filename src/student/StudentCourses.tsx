// Owner: Shivraj. "My courses" page: every course the student is in, plus the way to add more.
import { Link } from 'react-router-dom'
import { CourseCard } from './StudentHome.tsx'
import { useMyCourseProgress } from './useMyCourseProgress.ts'
import './student.css'

export function StudentCourses() {
  const { courses, modulesOf, isLoading, isError } = useMyCourseProgress()
  const mine = courses.filter((c) => c.source === 'self')
  const fromClass = courses.filter((c) => c.source === 'class')

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-divider pb-4">
        <div>
          <h1 className="st-serif text-4xl">My courses</h1>
          <p className="mt-1 text-cic-muted">Everything you're learning, on your own and with your class.</p>
        </div>
        <Link to="/student/explore" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-dark">+ Add a course</Link>
      </header>

      {isLoading && <p role="status" className="mt-8">Loading your courses…</p>}
      {isError && <p role="alert" className="mt-8">Could not load your courses. Try reloading.</p>}
      {!isLoading && !isError && !courses.length && (
        <p className="mt-8 rounded-2xl border border-dashed border-cic-gray p-8 text-center text-cic-muted">
          No courses yet. <Link className="font-semibold text-brand underline" to="/student/explore">Explore</Link> to add one,
          or <Link className="font-semibold text-brand underline" to="/student/start">take the 5-minute quiz</Link> to get a suggestion.
        </p>
      )}

      {[{ title: 'On my own', list: mine }, { title: 'With my class', list: fromClass }].map(({ title, list }) => list.length > 0 && (
        <section key={title} aria-label={title} className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-cic-muted">{title}</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((c) => <CourseCard key={c.id} course={c} modules={modulesOf(c.id)} />)}
          </div>
        </section>
      ))}
    </>
  )
}
