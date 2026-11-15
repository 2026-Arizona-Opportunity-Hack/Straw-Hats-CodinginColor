// Owner: Shivraj. "My classroom" page: join a class with a code and see the classes you're in.
import { ClassRow, JoinClass } from './StudentHome.tsx'
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
      <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
        <JoinClass />
        <section aria-label="My classes">
          {isLoading && <p role="status">Loading your classes…</p>}
          {isError && <p role="alert">Could not load your classes. Try reloading.</p>}
          {!isLoading && !isError && !classes.length && (
            <p className="rounded-2xl border border-dashed border-cic-gray p-6 text-center text-cic-muted">You haven't joined a class yet.</p>
          )}
          {classes.length > 0 && (
            <ul className="divide-y divide-divider rounded-2xl bg-white/60">
              {classes.map((c) => <ClassRow key={c.id} course={c} modules={modulesOf(c.id)} />)}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
