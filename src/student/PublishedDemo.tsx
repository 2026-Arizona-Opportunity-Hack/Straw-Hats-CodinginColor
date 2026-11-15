import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { HtmlActivityPreview } from '../instructor/HtmlActivity'
import { ActivityPreview } from '../instructor/LessonPreview'
import { labPayload } from '../instructor/labPayload'
import { browserInstructorStore } from '../instructor/store'
import type { Activity } from '../instructor/model'
import '../instructor/styles.css'
import { CodeLab } from '../shared/labs/CodeLab'
import { isLocalDemo } from '../shared/supabase'
import { useAuth } from '../shared/auth/AuthContext'
import { ActivityCard } from '../shared/ui/ActivityCard'
import { lessonSummary } from '../shared/ui/lessonContent'

function published() {
  return browserInstructorStore.load().courses.flatMap(course => course.modules.filter(module => module.published).map(module => ({ course, module })))
}

export function PublishedDemoList() {
  if (!isLocalDemo) return null
  return <section className="mt-6" aria-labelledby="published-demos">
    <h2 className="text-xl font-bold text-brand" id="published-demos">Instructor-published demos</h2>
    <p className="text-sm">Practice modules saved in this browser.</p>
    <ul className="mt-2 grid gap-2">{published().map(({ course, module }) => <li key={module.id}>
      <Link className="text-brand underline" to={'/student/demo/' + module.id}>{module.title}</Link> <span className="text-sm text-slate-600">· {course.title}</span>
    </li>)}</ul>
  </section>
}

export function PublishedDemo() {
  const { moduleId } = useParams()
  const { profile } = useAuth()
  const entry = isLocalDemo ? published().find(({ module }) => module.id === moduleId) : undefined
  if (!entry || !profile) return <p>Published demo unavailable.</p>
  const { course, module } = entry
  return <div className="ic-app ic-embedded">
    <header className="ic-page-header">
      <div><Link className="ic-back" to="/student">My courses</Link><h1>{module.title}</h1><p>{course.title} · Browser demo</p></div>
    </header>
    <div>{module.lessons.map(lesson => <article className="cic-lesson" key={lesson.id} aria-labelledby={'lesson-' + lesson.id}>
      <header className="cic-lesson-head">
        <h2 className="cic-lesson-title" id={'lesson-' + lesson.id}>{lesson.title}</h2>
        <p className="cic-lesson-meta">{lessonSummary(lesson.activities)}</p>
      </header>
      {lesson.activities.map((activity, index) => {
        const key = ['cic-learn.demo-attempt', profile.id, module.id, module.revision ?? 1, activity.id].join(':')
        return <StudentBlock key={key} activity={activity} storageKey={key} step={index + 1} total={lesson.activities.length} />
      })}
    </article>)}</div>
  </div>
}

function StudentBlock({ activity, storageKey, step, total }: { activity: Activity; storageKey: string; step: number; total: number }) {
  const [result, setResult] = useState<{ score?: number } | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [error, setError] = useState('')
  function finish(score?: number) {
    if (result) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ score }))
      setResult({ score })
      setError('')
    } catch { setError('Could not save completion in this browser.') }
  }
  const card = { id: 'step-' + activity.id, title: activity.title, step, total, done: !!result }
  if (activity.type === 'code') return <ActivityCard kind="code" {...card}>
    <CodeLab payload={labPayload(activity)} storageKey={storageKey + ':lab'} />
  </ActivityCard>
  if (activity.type === 'interactive_html' && activity.interactiveHtml) return <ActivityCard kind="interactive" {...card}>
    <HtmlActivityPreview activity={activity.interactiveHtml} title={activity.title} scripts onComplete={finish} completed={!!result} device />
    <p role="status" className="cic-complete">{result && <>Activity complete{result.score !== undefined ? ' · Practice score ' + Math.round(result.score * 100) + '%' : ''}.</>}</p>
    {error && <p role="alert" className="cic-error">{error}</p>}
  </ActivityCard>
  return <ActivityPreview activity={activity} interactive step={step} total={total} />
}
