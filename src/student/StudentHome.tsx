// Owner: Jacky.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  enrollErrorMessage, enrollInCourse, listAvailableCourses, listModuleStatus, listMyCourses, type StudentCourse,
} from '../api/student/index.ts'
import { PublishedDemoList } from './PublishedDemo'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { Button, Card, PageHeader, TodoPanel } from '../shared/ui/index.tsx'

function CourseModules({ courseId, studentId }: { courseId: string; studentId?: string }) {
  const { data: modules = [], isLoading, isError } = useQuery({
    queryKey: ['moduleStatus', studentId, courseId], queryFn: () => listModuleStatus(courseId),
  })
  if (isLoading) return <p role="status">Loading modules…</p>
  if (isError) return <p role="alert">Could not load these modules. Try reloading.</p>
  if (!modules.length) return <p>There are no released modules yet.</p>
  return (
    <ol className="space-y-2">
      {modules.map((m) => (
        <li key={m.module_id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <span>{m.title}</span>
          {m.state === 'locked' ? (
            <span className="text-sm text-slate-500">Locked</span>
          ) : (
            <Link to={`/student/module/${m.module_id}`} className="text-sm font-medium text-brand underline">
              {m.state === 'completed' ? 'Review' : 'Start'}
            </Link>
          )}
        </li>
      ))}
    </ol>
  )
}

const courseHeadingId = (courseId: string) => `course-${courseId}`

function BrowseCourses({ studentId, onEnrolled }: { studentId?: string; onEnrolled: (course: StudentCourse) => void }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const { data: courses = [], isLoading, isError } = useQuery({
    queryKey: ['availableCourses', studentId], queryFn: listAvailableCourses,
  })
  const enroll = useMutation({
    mutationFn: (course: StudentCourse) => enrollInCourse(course.id),
    onMutate: (course) => setStatus(`Enrolling you in ${course.title}…`),
    onSuccess: async (_, course) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['myCourses', studentId] }),
        queryClient.invalidateQueries({ queryKey: ['availableCourses', studentId] }),
      ])
      setStatus(`You are enrolled in ${course.title}. It is now under My courses.`)
      onEnrolled(course)
    },
    onError: (error) => setStatus(enrollErrorMessage(error)),
  })

  return (
    <section className="mt-8" aria-labelledby="browse-courses">
      <h2 id="browse-courses" className="text-2xl tracking-tight">Browse courses</h2>
      <p className="mb-4 text-base text-cic-muted">Self-paced courses you can start on your own.</p>
      <p role="status" className={`mb-3 text-sm ${enroll.isError ? 'font-medium text-danger' : 'text-slate-600'}`}>{status}</p>
      {isLoading && <p>Loading courses…</p>}
      {isError && <p role="alert">Could not load the course list. Try reloading.</p>}
      {!isLoading && !isError && !courses.length && <p>You are in every course that is open right now.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((c) => (
          <Card key={c.id} title={c.title}>
            <p className="mb-1 text-sm font-medium text-slate-700"><span className="capitalize">{c.level}</span> · Self-paced</p>
            <p className="mb-4 text-sm text-slate-600">{c.description}</p>
            <Button disabled={enroll.isPending} onClick={() => enroll.mutate(c)} aria-label={`Enroll in ${c.title}`}>
              {enroll.isPending && enroll.variables?.id === c.id ? 'Enrolling…' : 'Enroll'}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  )
}

export function StudentHome() {
  const { profile } = useAuth()
  const { data: courses = [], isLoading, isError } = useQuery({
    queryKey: ['myCourses', profile?.id], queryFn: listMyCourses,
  })
  // After enrolling, move focus to the new course once it renders under My courses.
  const focusCourseId = useRef<string | null>(null)
  const focusPending = () => {
    const heading = focusCourseId.current && document.getElementById(courseHeadingId(focusCourseId.current))
    if (!heading) return
    focusCourseId.current = null
    heading.focus()
    heading.scrollIntoView({ block: 'center' })
  }
  useEffect(focusPending, [courses])

  return (
    <>
      <PageHeader title="My courses" subtitle="Pick up where you left off." />
      {isLoading && <p role="status">Loading courses…</p>}
      {isError && <p role="alert">Could not load your courses. Try reloading.</p>}
      {!isLoading && !isError && !courses.length && <p>You have no enrolled courses yet.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((c) => (
          <Card key={c.id}>
            <h2 id={courseHeadingId(c.id)} tabIndex={-1} className="mb-4 text-lg">{c.title}</h2>
            <p className="mb-3 text-sm text-slate-600">{c.description}</p>
            <CourseModules courseId={c.id} studentId={profile?.id} />
          </Card>
        ))}
      </div>
      <BrowseCourses studentId={profile?.id} onEnrolled={(course) => { focusCourseId.current = course.id; focusPending() }} />
      <PublishedDemoList />
      <div className="mt-6">
        <TodoPanel
          owner="Jacky"
          items={['Placement quiz + course picker', 'Checkpoint map + resume', 'My progress (XP, badges, streak)', 'Phone layout']}
        />
      </div>
    </>
  )
}
