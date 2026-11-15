// Owner: Jacky.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listModuleStatus, listMyCourses } from '../api/student/index.ts'
import { PublishedDemoList } from './PublishedDemo'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { Card, PageHeader, TodoPanel } from '../shared/ui/index.tsx'

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

export function StudentHome() {
  const { profile } = useAuth()
  const { data: courses = [], isLoading, isError } = useQuery({
    queryKey: ['myCourses', profile?.id], queryFn: listMyCourses,
  })

  return (
    <>
      <PageHeader title="My courses" subtitle="Pick up where you left off." />
      {isLoading && <p role="status">Loading courses…</p>}
      {isError && <p role="alert">Could not load your courses. Try reloading.</p>}
      {!isLoading && !isError && !courses.length && <p>You have no enrolled courses yet.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((c) => (
          <Card key={c.id} title={c.title}>
            <p className="mb-3 text-sm text-slate-600">{c.description}</p>
            <CourseModules courseId={c.id} studentId={profile?.id} />
          </Card>
        ))}
      </div>
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
