// Owner: Shivraj. "My classroom" page: the classes you're in as course cards (like My courses),
// with the join-a-class box centered underneath.
import { CourseCard, JoinClass } from './StudentHome.tsx'
import { useMyCourseProgress } from './useMyCourseProgress.ts'
import './student.css'

export function StudentClassroom() {
  const { courses, modulesOf, isLoading, isError } = useMyCourseProgress()
  const classes = courses.filter((c) => c.source === 'class')

  return (
    <>
      <header className="border-b border-divider pb-4">
        <h1 className="st-serif text-4xl">My classroom</h1>
        <p className="mt-1 text-cic-muted">Classes you joined with a code from your teacher.</p>
      </header>

      <section aria-label="My classes" className="mt-8">
        {isLoading && <p role="status">Loading your classes…</p>}
        {isError && <p role="alert">Could not load your classes. Try reloading.</p>}
        {!isLoading && !isError && !classes.length && (
          <p className="rounded-2xl border border-dashed border-cic-gray p-8 text-center text-cic-muted">
            You haven't joined a class yet. Enter your teacher's code below.
          </p>
        )}
        {classes.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((c) => <CourseCard key={c.id} course={c} modules={modulesOf(c.id)} />)}
          </div>
        )}
      </section>

      <div className="mx-auto mt-10 w-full max-w-md">
        <JoinClass />
      </div>
    </>
  )
}
