import { useState } from 'react'
import { HtmlActivityPreview } from '../instructor/HtmlActivity'
import { labPayload } from '../instructor/labPayload'
import type { Activity, Lesson } from '../instructor/model'
import { practiceAttempt, previewActivity } from '../instructor/studentPreview'
import { CodeLab } from '../shared/labs/CodeLab'
import { previewCatPhotoChecks } from '../shared/labs/catPhoto'
import { Card } from '../shared/ui/index.tsx'
import { ActivityBlock } from './LessonContent'

export function DemoLesson({ lesson, attemptKey }: { lesson: Lesson; attemptKey?: string }) {
  return <article className="ic-panel ic-stack">
    <h2>{lesson.title}</h2>
    {lesson.activities.map((activity, index) => {
      const storageKey = attemptKey ? attemptKey + ':' + activity.id : undefined
      return <StudentBlock key={storageKey ?? activity.id} activity={activity} lessonId={lesson.id} index={index} storageKey={storageKey} />
    })}
  </article>
}

function StudentBlock({ activity, lessonId, index, storageKey }: { activity: Activity; lessonId: string; index: number; storageKey?: string }) {
  const [result, setResult] = useState<{ score?: number } | null>(() => {
    try {
      const raw = storageKey ? localStorage.getItem(storageKey) : null
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [error, setError] = useState('')
  function finish(score?: number) {
    if (result) return
    try {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ score }))
      setResult({ score })
      setError('')
    } catch { setError('Could not save completion in this browser.') }
  }
  if (activity.type === 'code') return <section className="ic-article-activity">
    <h3>{activity.title}</h3><CodeLab payload={labPayload(activity)} storageKey={storageKey ? storageKey + ':lab' : undefined} allowSubmit
      completed={!!result} verifyWeb={activity.code?.lab?.verifier === 'cat-photo-v1' ? async source => {
        const verified = await previewCatPhotoChecks(source)
        if (verified.completed) finish()
        return verified
      } : undefined} />
  </section>
  if (activity.type === 'interactive_html' && activity.interactiveHtml) return <section className="ic-article-activity ic-article-exercise">
    <h3>{activity.title}</h3>
    <HtmlActivityPreview activity={activity.interactiveHtml} title={activity.title} scripts onComplete={finish} completed={!!result} />
    {result && <p role="status">Activity complete{result.score !== undefined ? ' · Practice score ' + Math.round(result.score * 100) + '%' : ''}.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
  const block = previewActivity(activity, lessonId, index)
  return <Card><ActivityBlock activity={block} demoDiscussion={!!storageKey && activity.id === 'builder-reflection'}
    onAttempt={input => practiceAttempt(block, input)} /></Card>
}
