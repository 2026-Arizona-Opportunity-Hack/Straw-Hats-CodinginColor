import { Link, useParams } from 'react-router-dom'
import { browserInstructorStore } from '../instructor/store'
import '../instructor/styles.css'
import { isLocalDemo } from '../shared/supabase'
import { useAuth } from '../shared/auth/AuthContext'
import { DemoLesson } from './DemoLesson'

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
    <div className="cic-student-lessons">{module.lessons.map(lesson => <DemoLesson key={lesson.id} lesson={lesson}
      attemptKey={['cic-learn.demo-attempt', profile.id, module.id, module.revision ?? 1].join(':')} />)}</div>
  </div>
}
