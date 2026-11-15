// Owner: Jacky. Renders a module as one scrolling page of blocks (zyBooks/Colab style).
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { getModule, recordAttempt } from '../api/student/index.ts'
import type { Activity } from '../shared/types/db.ts'
import { isLocalDemo } from '../shared/supabase.ts'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import { Button, Card, PageHeader } from '../shared/ui/index.tsx'

function InteractiveBlock({ activity }: { activity: Activity<'interactive_html'> }) {
  const [done, setDone] = useState<number | null | undefined>(undefined)
  const { html, instructions, reports_score } = activity.content

  async function complete(score?: number) {
    await recordAttempt({ activity_id: activity.id, class_id: 'TODO', response: null, client_score: score, time_on_task_ms: 0 })
    setDone(score ?? null)
  }

  return (
    <div className="space-y-3">
      {instructions && <p>{instructions}</p>}
      <InteractiveHtmlFrame html={html} allowScripts={isLocalDemo} title={`Interactive activity: ${activity.concept}`} onComplete={reports_score && done === undefined ? (s) => void complete(s) : undefined} />
      {done !== undefined ? (
        <p role="status" className="font-medium text-green-800">
          Done{done !== null ? ` (score ${Math.round(done * 100)}%)` : ''}
        </p>
      ) : (
        (!reports_score || !isLocalDemo) && <Button onClick={() => void complete()}>Mark as done</Button>
      )}
    </div>
  )
}

function ActivityBlock({ activity }: { activity: Activity }) {
  switch (activity.type) {
    case 'interactive_html':
      return <InteractiveBlock activity={activity as Activity<'interactive_html'>} />
    case 'content':
      // TODO(Jacky): render with react-markdown + rehype-sanitize.
      return <pre className="whitespace-pre-wrap font-sans">{(activity as Activity<'content'>).content.markdown}</pre>
    default:
      // TODO(Jacky): video, check, worksheet, code (Pyodide), exit, pretest, posttest.
      return <p className="text-slate-600">[{activity.type} activity: renderer not built yet]</p>
  }
}

export function ModulePlayer() {
  const { moduleId = '' } = useParams()
  const { data: mod, isLoading } = useQuery({ queryKey: ['module', moduleId], queryFn: () => getModule(moduleId) })

  if (isLoading) return <p>Loading…</p>
  if (!mod) return <p>Module not found.</p>

  return (
    <>
      <PageHeader title={mod.title} subtitle={`Concept: ${mod.concept}`} />
      <div className="space-y-4">
        {mod.lessons.flatMap((lesson) =>
          lesson.activities.map((a) => (
            <Card key={a.id}>
              <ActivityBlock activity={a} />
            </Card>
          )),
        )}
      </div>
    </>
  )
}
