// Owner: Ken. CIC preset courses an instructor can copy into their own class.
import { useMutation, useQuery } from '@tanstack/react-query'
import { copyLibraryCourse, listLibraryCourses } from '../api/instructor/index.ts'
import { Button, Card, PageHeader } from '../shared/ui/index.tsx'

const MODE_LABEL = { self_paced: 'Self-paced', instructor_led: 'Instructor-led' } as const

export function CourseLibrary() {
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['library'], queryFn: listLibraryCourses })
  const copy = useMutation({ mutationFn: copyLibraryCourse })

  return (
    <>
      <PageHeader title="Course library" subtitle="Copy a CIC course, then edit your copy." />
      {isLoading && <p>Loading…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((c) => (
          <Card key={c.id} title={c.title}>
            <p className="text-sm text-slate-600">{c.description}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {c.level} · {MODE_LABEL[c.delivery_mode]}
            </p>
            <Button className="mt-4" onClick={() => copy.mutate(c.id)} disabled={copy.isPending}>
              Copy to my courses
            </Button>
          </Card>
        ))}
      </div>
      {copy.isSuccess && (
        <p role="status" className="mt-4 font-medium text-green-800">
          Copied “{copy.data.title}”. It is unpublished until you publish it.
        </p>
      )}
    </>
  )
}
