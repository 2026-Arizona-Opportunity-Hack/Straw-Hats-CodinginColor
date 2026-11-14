// Owner: Ken. External K12 teacher / district admin: read-only curriculum.
import { useQuery } from '@tanstack/react-query'
import { listLibraryCourses } from '../api/instructor/index.ts'
import { Card, PageHeader } from '../shared/ui/index.tsx'

export function ReviewerHome() {
  const { data: courses = [] } = useQuery({ queryKey: ['library'], queryFn: listLibraryCourses })
  return (
    <>
      <PageHeader title="CIC curriculum" subtitle="Read-only view for reviewers." />
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((c) => (
          <Card key={c.id} title={c.title}>
            <p className="text-sm text-slate-600">{c.description}</p>
          </Card>
        ))}
      </div>
    </>
  )
}
