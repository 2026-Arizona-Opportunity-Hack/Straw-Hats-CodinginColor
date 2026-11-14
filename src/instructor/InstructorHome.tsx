// Owner: Ken.
import { useQuery } from '@tanstack/react-query'
import { getClassProgress, listMyClasses } from '../api/instructor/index.ts'
import { Card, PageHeader, TodoPanel } from '../shared/ui/index.tsx'

const STATUS_LABEL = { on_track: 'On track', stuck: 'Stuck', not_started: 'Not started', done: 'Done' } as const

function ClassProgress({ classId }: { classId: string }) {
  const { data: rows = [] } = useQuery({ queryKey: ['classProgress', classId], queryFn: () => getClassProgress(classId) })
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Student progress</caption>
      <thead>
        <tr className="border-b border-slate-200">
          <th scope="col" className="py-2">Student</th>
          <th scope="col">Progress</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.student_id} className="border-b border-slate-100">
            <td className="py-2">{r.display_name}</td>
            <td>
              {r.completed_activities}/{r.total_activities}
            </td>
            <td>{STATUS_LABEL[r.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function InstructorHome() {
  const { data: classes = [], isLoading } = useQuery({ queryKey: ['myClasses'], queryFn: listMyClasses })

  return (
    <>
      <PageHeader title="My classes" />
      {isLoading && <p>Loading…</p>}
      <div className="space-y-4">
        {classes.map((c) => (
          <Card key={c.id} title={`${c.name} · join code ${c.join_code}`}>
            <ClassProgress classId={c.id} />
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <TodoPanel
          owner="Ken"
          items={[
            'Class setup wizard: name, roster CSV, course, login cards (< 10 min)',
            'Course builder: module > lesson > activity tree, per-type editors, interactive HTML paste/upload',
            'Import: markdown/docs, AI module converter',
            'Stuck / not-started lists, concept mastery heatmap, student detail drawer',
          ]}
        />
      </div>
    </>
  )
}
