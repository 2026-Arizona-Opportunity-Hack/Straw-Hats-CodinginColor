import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, ChartNoAxesCombined, ClipboardList, Eye, PencilLine, RotateCcw, School } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import cicLogo from '../instructor/cic-logo.png'
import type { ActivityStatus, AttemptInput } from '../api/student/index'
import { DashboardTab } from '../instructor/ClassTabs'
import { CourseBuilder, CourseReviewer } from '../instructor/Curriculum'
import { Gradebook } from '../instructor/assignments/Gradebook'
import { gainBreakdown } from '../instructor/dashboard'
import { LibraryDemo } from '../instructor/demoData'
import { changeModuleState, publishModule, type Activity, type Attempt, type ClassGroup, type Course } from '../instructor/model'
import { percent, points } from '../instructor/progress'
import '../instructor/styles.css'
import { practiceAttempt, previewActivity } from '../instructor/studentPreview'
import { Button, Card, Field, Select, StatTile } from '../shared/ui'
import { ActivityBlock, LessonLayout } from '../student/LessonContent'
import { seedWalkthrough } from './seed'
import './demo.css'

const stops = [
  { id: 'student', label: 'Student lesson', role: 'Student', icon: BookOpen,
    instruction: 'Start as Riley. Take the warm-up, read the example, answer the practice question, and pass the final check to open the next module.' },
  { id: 'builder', label: 'Curriculum builder', role: 'Instructor', icon: PencilLine,
    instruction: 'Edit the lesson title, preview the module, and save a draft. To try publishing, select Variables and values in the outline and choose Publish update.' },
  { id: 'dashboard', label: 'Class dashboard', role: 'Instructor', icon: School,
    instruction: 'Open a student who needs attention or expand a module. Riley’s practice and assessment results appear here when you complete the student lesson.' },
  { id: 'gradebook', label: 'Gradebook', role: 'Instructor', icon: ClipboardList,
    instruction: 'Filter for work to grade, open a score cell, and leave feedback. Your grades and feedback stay in this demo.' },
  { id: 'impact', label: 'Impact report', role: 'Program admin', icon: ChartNoAxesCombined,
    instruction: 'Compare warm-up and final results for the same students. Filter by school or download the aggregate sample report.' },
  { id: 'reviewer', label: 'Reviewer library', role: 'Reviewer', icon: Eye,
    instruction: 'Open the lesson list and browse the published AI Academy material as an outside educator.' },
] as const

type Stop = (typeof stops)[number]['id']
const href = (id: Stop) => '?step=' + id

function StudentScene({ course, group, onPractice }: {
  course: Course; group: ClassGroup; onPractice: (block: Activity, input: AttemptInput) => Promise<Awaited<ReturnType<typeof practiceAttempt>>>
}) {
  const student = group.learners[0]
  const [showNext, setShowNext] = useState(false)
  const current = course.modules.find(module => module.id === 'variables' && module.published)
  const next = course.modules.find(module => module.id === 'loops' && module.published)
  const attempted = new Map(student.attempts.map(attempt => [attempt.activityId, attempt]))
  const required = current?.lessons.flatMap(lesson => lesson.activities.filter(block => block.type !== 'content')) ?? []
  const unlocked = required.some(block => block.type === 'posttest') && required.every(block => {
    const attempt = attempted.get(block.id)
    return attempt?.submitted && (block.type !== 'posttest' || (attempt.score ?? 0) >= group.rules!.passMark.variables)
  })
  const module = showNext && unlocked ? next : current
  return <div className="demo-flow">
    <div className="demo-context"><School size={18} aria-hidden="true" /> {group.school} <span>·</span> {student.name}</div>
    <div className="demo-module">
      <div><strong>{module?.title ?? 'No published lesson'}</strong><p>{course.title}</p></div>
      {next && (!showNext || !unlocked) && <Button type="button" variant="secondary" disabled={!unlocked} onClick={() => setShowNext(true)}>
        {unlocked ? 'Open ' + next.title : next.title + ' is locked'}
      </Button>}
      {showNext && unlocked && <Button type="button" variant="secondary" onClick={() => setShowNext(false)}>Back to variables</Button>}
    </div>
    {unlocked && <p className="demo-feedback" role="status">Module complete. Repeat with loops is now unlocked.</p>}
    {module?.lessons.map(lesson => <LessonLayout key={lesson.id} title={lesson.title}>
      {lesson.activities.map((block, index) => {
        const attempt = attempted.get(block.id)
        const status: ActivityStatus | undefined = attempt && { activity_id: block.id, submitted: true, best_score: attempt.score === null ? null : attempt.score / 100 }
        return <Card key={block.id}>
          <ActivityBlock activity={previewActivity(block, lesson.id, index)} status={status}
            answerOnce={block.type === 'pretest'} onAttempt={input => onPractice(block, input)} />
        </Card>
      })}
    </LessonLayout>)}
  </div>
}

function ImpactScene({ classes, course }: { classes: ClassGroup[]; course: Course }) {
  const [school, setSchool] = useState('')
  const rows = classes.filter(group => !school || group.school === school).map(group => ({ group, ...gainBreakdown(group, course) }))
  const paired = rows.reduce((total, row) => total + row.students, 0)
  const gain = paired ? rows.reduce((total, row) => total + (row.gain ?? 0) * row.students, 0) / paired : null

  function download() {
    const sheet = ['School,Students with both checks,Warm-up average,Final average,Learning gain (points)',
      ...rows.map(row => [row.group.school, row.students, percent(row.pre), percent(row.post), points(row.gain)].join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([sheet], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'cic-learn-sample-impact.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  return <div className="demo-flow">
    <div className="demo-report-controls">
      <Field id="demo-filter-school" label="School">
        <Select id="demo-filter-school" value={school} onChange={event => setSchool(event.target.value)}>
          <option value="">All schools</option>
          {classes.map(group => <option key={group.id}>{group.school}</option>)}
        </Select>
      </Field>
      <Button type="button" variant="secondary" onClick={download}>Download aggregate CSV</Button>
    </div>
    <div className="demo-stats">
      <StatTile label="Schools" value={String(rows.length)} hint="Fictional partner schools" />
      <StatTile label="Students assessed" value={String(paired)} hint="Students with both checks" />
      <StatTile label="Average learning gain" value={points(gain)} hint="Final check minus warm-up" />
    </div>
    <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Aggregate results by school">
      <table className="ic-data-table">
        <thead><tr><th scope="col">School</th><th scope="col">Students assessed</th><th scope="col">Warm-up</th><th scope="col">Final check</th><th scope="col">Gain</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.group.id}>
          <th scope="row">{row.group.school}</th><td>{row.students}</td><td>{percent(row.pre)}</td><td>{percent(row.post)}</td><td>{points(row.gain)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}

export default function DemoWalkthrough() {
  const [search] = useSearchParams()
  const index = Math.max(0, stops.findIndex(stop => stop.id === search.get('step')))
  const { id, label, role, instruction } = stops[index]
  const [session, setSession] = useState(seedWalkthrough)
  const [draft, setDraft] = useState<Course>()
  const [library, setLibrary] = useState<Activity[]>([])
  const [resetCount, setResetCount] = useState(0)
  const [group] = session.classes
  const { course } = session
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(id)
  useEffect(() => {
    if (previousStep.current === id) return
    previousStep.current = id
    heading.current?.focus()
  }, [id])

  function updateClass(next: ClassGroup) {
    setSession(current => ({ ...current, classes: current.classes.map(item => item.id === next.id ? next : item) }))
    return true
  }

  async function savePractice(block: Activity, input: AttemptInput) {
    const result = await practiceAttempt(previewActivity(block, '', 0), input)
    const score = result.score === null ? null : result.score * 100
    setSession(current => {
      const [primary, ...rest] = current.classes
      const [student, ...classmates] = primary.learners
      const old = student.attempts.find(attempt => attempt.activityId === block.id)
      const attempt: Attempt = {
        activityId: block.id, submitted: true, count: (old?.count ?? 0) + 1,
        minutes: (old?.minutes ?? 0) + (input.time_on_task_ms ?? 0) / 60_000,
        score: score === null ? old?.score ?? null : Math.max(old?.score ?? 0, score),
      }
      const attempts = [...student.attempts.filter(item => item.activityId !== block.id), attempt]
      return { ...current, classes: [{ ...primary, learners: [{ ...student, attempts, lastActive: new Date().toISOString() }, ...classmates] }, ...rest] }
    })
    return result
  }

  function reset() {
    setSession(seedWalkthrough())
    setDraft(undefined)
    setLibrary([])
    setResetCount(count => count + 1)
  }
  const last = index === stops.length - 1
  const setCourse = (next: Course) => setSession(current => ({ ...current, course: next }))
  return <div className="demo">
    <a href="#demo-content" className="demo-skip">Skip to demo</a>
    <header className="demo-top"><div className="demo-wrap">
      <a href="https://cic-learn.vercel.app/" className="demo-brand"><img src={cicLogo} alt="" width="36" height="36" /> CIC Learn</a>
      <Button type="button" variant="ghost" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Reset demo</Button>
    </div></header>
    <main className="demo-wrap" id="demo-content" tabIndex={-1}>
      <div className="demo-intro">
        <h1>Explore CIC Learn</h1>
        <p>Follow one class from its first lesson to a program impact report. No sign-in required. Schools and students are fictional, and your changes reset when you reload.</p>
      </div>
      <nav id="demo-steps" className="demo-steps" aria-label="Walkthrough steps">
        {stops.map(({ id: stop, label: title, icon: Icon }) => <Link key={stop} to={href(stop)} aria-current={id === stop ? 'step' : undefined}>
          <Icon size={20} aria-hidden="true" /> <span>{title}</span>
        </Link>)}
      </nav>
      <div className="demo-guide">
        <p>{role} · Step {index + 1} of {stops.length}</p>
        <h2 ref={heading} tabIndex={-1}>{label}</h2>
        <p>{instruction}</p>
      </div>
      <section className="ic-app ic-embedded demo-scene" key={id + resetCount} aria-label={label}>
        {['builder', 'dashboard', 'gradebook'].includes(id) && <p className="demo-context demo-class">
          <School size={18} aria-hidden="true" /> {group.school} <span>·</span> {group.name}
        </p>}
        {id === 'student' && <StudentScene course={course} group={group} onPractice={savePractice} />}
        {id === 'builder' && <CourseBuilder initial={draft ?? course} released={course} localAuthoring materialImport={false} level={2}
          assigned={new Set(group.moduleIds)} library={library} onSaveLibrary={next => { setLibrary(next); return true }}
          back={{ label: 'Walkthrough steps', to: '#demo-steps' }}
          onSave={next => { setDraft(next); return true }}
          onRelease={async (next, module) => { setCourse(publishModule(course, next, module)); setDraft(next); return { draft: next } }}
          onManageModule={async (next, moduleId, action) => {
            if (group.moduleIds.includes(moduleId)) return false
            setCourse(changeModuleState(course, moduleId, action))
            const modified = changeModuleState(next, moduleId, action)
            setDraft(modified)
            return modified
          }} />}
        {id === 'dashboard' && <DashboardTab group={group} course={course} classLinks={false} />}
        {id === 'gradebook' && <Gradebook group={group} onSave={updateClass} classLinks={false} />}
        {id === 'impact' && <ImpactScene classes={session.classes} course={course} />}
        {id === 'reviewer' && <CourseReviewer course={LibraryDemo} back={null} level={2} />}
      </section>
      <nav className="demo-pagination" aria-label="Previous and next steps">
        {index > 0 ? <Link className="demo-step-button" to={href(stops[index - 1].id)}><ArrowLeft size={17} aria-hidden="true" /> Previous step</Link> : <span />}
        <Link className="demo-step-button demo-step-next" to={href(last ? 'student' : stops[index + 1].id)}>
          {last ? 'Back to the student lesson' : 'Next: ' + stops[index + 1].label} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </nav>
    </main>
    <footer className="demo-wrap demo-footer">
      <p>Built by Straw Hats for Coding in Color at ASU Opportunity Hack.</p>
      <a href="https://github.com/2026-Arizona-Opportunity-Hack/Straw-Hats-CodinginColor">View on GitHub</a>
    </footer>
  </div>
}
