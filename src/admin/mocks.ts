// Owner: Aryan. Mock-mode data for the admin pages, shaped exactly like the real tables
// (supabase/migrations/0001_core_schema.sql). Deterministic so demos look the same every time.
// Mirrors supabase/seed.sql so mock mode and the seeded database tell the same story.
import type { ActivityType } from '../shared/types/activities.ts'
import type { Application, Issue } from './api.ts'
import type { OrgData } from './metrics.ts'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000
const TEMPLATE: { type: ActivityType; minutes: number }[] = [
  { type: 'pretest', minutes: 7 },
  { type: 'video', minutes: 4 },
  { type: 'check', minutes: 1 },
  { type: 'worksheet', minutes: 12 },
  { type: 'code', minutes: 15 },
  { type: 'exit', minutes: 2 },
  { type: 'posttest', minutes: 8 },
]

export function buildMockOrg(now = Date.now()): OrgData {
  const rand = rng(42)
  const course = { id: 'course-intro-python', title: 'Intro to Python', delivery_mode: 'self_paced' as const }
  const modules = [
    { id: 'mod-variables', title: 'Variables & Data Types', concept: 'variables' },
    { id: 'mod-conditionals', title: 'Making Decisions', concept: 'conditionals' },
    { id: 'mod-loops', title: 'Loops', concept: 'loops' },
    { id: 'mod-functions', title: 'Functions', concept: 'functions', draft: true },
  ].map((m, i) => ({ id: m.id, course_id: course.id, title: m.title, position: i + 1, concept: m.concept, published: !m.draft }))
  const activities = modules.flatMap((m) =>
    TEMPLATE.map((t) => ({ id: `${m.id}-${t.type}`, module_id: m.id, type: t.type, concept: m.concept, counts_toward_unlock: true })),
  )

  const classes = [
    { id: 'class-mary-p3', name: 'Maryvale Period 3', school: 'Maryvale High School', join_code: 'MARY-P3' },
    { id: 'class-dehs-p5', name: 'Desert Edge Period 5', school: 'Desert Edge High School', join_code: 'DEHS-P5' },
    { id: 'class-chchs-as', name: 'Carl Hayden After School', school: 'Carl Hayden Community High School', join_code: 'CHCHS-AS' },
  ].map((c) => ({ ...c, course_id: course.id, created_at: new Date(now - 25 * DAY).toISOString(), archived_at: null as string | null }))
  // A past-term class: archived automatically because its term has ended.
  classes.push({
    id: 'class-mary-spring', name: 'Maryvale Spring Cohort', school: 'Maryvale High School', join_code: 'MARY-SP26',
    course_id: course.id, created_at: new Date(new Date(now).getFullYear(), 1, 2).toISOString(), archived_at: null,
  })

  const people: OrgData['people'] = [
    { id: 'mock-admin', role: 'admin', display_name: 'CIC Admin', school: null },
    { id: 'mock-instructor', role: 'instructor', display_name: 'Mr. Lopez', school: 'Maryvale High School' },
    { id: 'instr-ana', role: 'instructor', display_name: 'Ana Lopez', school: 'Desert Edge High School' },
    { id: 'mock-reviewer', role: 'reviewer', display_name: 'District Reviewer', school: null },
    { id: 'instr-jordan', role: 'instructor', display_name: 'Jordan Ellis', school: 'Maryvale High School', archived_at: new Date(now - 60 * DAY).toISOString() },
  ]
  const classInstructors = [
    { class_id: 'class-mary-p3', instructor_id: 'mock-instructor' },
    { class_id: 'class-dehs-p5', instructor_id: 'instr-ana' },
    { class_id: 'class-chchs-as', instructor_id: 'instr-ana' },
  ]

  // profile: done = finished everything, mid = part-way and active, stuck = 3 failed code tries then idle,
  // none = never started.
  const roster: [string, string, 'done' | 'mid' | 'stuck' | 'none'][] = [
    ['class-mary-p3', 'Jayla Brooks', 'done'], ['class-mary-p3', 'Andre Thomas', 'done'], ['class-mary-p3', 'Sofia Ramirez', 'mid'],
    ['class-mary-p3', 'Malik Johnson', 'stuck'], ['class-mary-p3', 'Priya Nair', 'mid'], ['class-mary-p3', 'Diego Hernandez', 'none'],
    ['class-mary-p3', 'Imani Carter', 'mid'],
    ['class-dehs-p5', 'Lena Okafor', 'done'], ['class-dehs-p5', 'Marcus Lee', 'mid'], ['class-dehs-p5', 'Grace Kim', 'mid'],
    ['class-dehs-p5', 'Elijah Watson', 'stuck'], ['class-dehs-p5', 'Camila Torres', 'none'],
    ['class-chchs-as', 'Xavier Brown', 'done'], ['class-chchs-as', 'Aaliyah Davis', 'done'], ['class-chchs-as', 'Mateo Garcia', 'mid'],
    ['class-chchs-as', 'Nia Robinson', 'stuck'],
  ]

  const enrollments: OrgData['enrollments'] = []
  const attempts: OrgData['attempts'] = []
  const published = activities.filter((a) => modules.find((m) => m.id === a.module_id)?.published)
  roster.forEach(([classId, name, profile], i) => {
    const sid = `stu-${i + 1}`
    const school = classes.find((c) => c.id === classId)!.school
    people.push({ id: sid, role: 'student', display_name: name, school })
    enrollments.push({ class_id: classId, student_id: sid })
    if (profile === 'none') return

    const skill = 0.45 + rand() * 0.45
    const stopAt = profile === 'done' ? published.length : profile === 'mid' ? 8 + Math.floor(rand() * 6) : 4
    let t = now - (profile === 'mid' ? 5 : 22) * DAY
    published.slice(0, stopAt + (profile === 'stuck' ? 1 : 0)).forEach((a, n) => {
      const tmpl = TEMPLATE.find((x) => x.type === a.type)!
      t += (25 + rand() * 50) * 60_000 + (a.type === 'pretest' && n > 0 ? DAY : 0)
      const push = (score: number, attemptNo: number, at: number) =>
        attempts.push({
          student_id: sid,
          activity_id: a.id,
          class_id: classId,
          attempt_no: attemptNo,
          score,
          is_correct: score >= 0.7,
          submitted_at: new Date(at).toISOString(),
          time_on_task_ms: Math.round((tmpl.minutes + rand() * 2) * 60_000),
        })
      if (profile === 'stuck' && n === stopAt) {
        const at = now - (9 + rand() * 5) * DAY
        for (let k = 1; k <= 3; k++) push(0, k, at + k * 12 * 60_000)
        return
      }
      if (a.type === 'pretest') return push(Math.round(Math.min(1, Math.max(0, skill * 0.55 + (rand() - 0.5) * 0.3)) * 5) / 5, 1, t)
      if (a.type === 'posttest') {
        const s = Math.round(Math.min(1, skill * 0.55 + 0.25 + rand() * 0.25) * 5) / 5
        if (s >= 0.7) return push(s, 1, t)
        push(s, 1, t)
        return push(0.8, 2, t + DAY)
      }
      if (a.type === 'check') return push(rand() < skill + 0.15 ? 1 : 0, 1, t)
      if (a.type === 'video' || a.type === 'exit') return push(1, 1, t)
      return push(Math.round((0.55 + rand() * 0.45) * 100) / 100, 1, t)
    })
  })

  return {
    classes,
    courses: [course, { id: 'course-ai-basics', title: 'AI Basics', delivery_mode: 'instructor_led' }],
    classInstructors,
    enrollments,
    classModules: [],
    modules,
    activities,
    attempts,
    people,
    // Mock-only stand-ins for program_settings and class_module_settings (the live app reads them from the database).
    settings: { inactive_days: 3 },
    classModuleSettings: classes.flatMap((k) => modules.filter((m) => m.course_id === k.course_id)
      .map((m) => ({ class_id: k.id, module_id: m.id, pass_mark: 0.7, max_posttest_tries: 3 }))),
    courseEnrollments: [],
    selfPacedAttempts: [],
  }
}

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

export const MOCK_ISSUES: Issue[] = [
  { id: 'iss-1', instructor_name: 'Mr. Lopez', contact_email: 'lopez@maryvale.example', class_name: 'Maryvale Period 3', subject: 'Three students locked out', message: 'Malik, Diego and Imani forgot their passcodes and the reset link is not arriving.', status: 'open', created_at: ago(0.2) },
  { id: 'iss-2', instructor_name: 'Ana Lopez', contact_email: 'ana.lopez@desertedge.example', class_name: 'Desert Edge Period 5', subject: 'Loops video will not play on Chromebooks', message: 'The school network blocks the embedded player. Can we get a downloadable copy?', status: 'open', created_at: ago(1.5) },
  { id: 'iss-3', instructor_name: 'Ana Lopez', contact_email: 'ana.lopez@desertedge.example', class_name: 'Carl Hayden After School', subject: 'Need more laptops for Thursday', message: 'We have 9 students and 6 working laptops.', status: 'resolved', created_at: ago(6) },
]

export const MOCK_APPLICATIONS: Application[] = [
  { id: 'app-1', name: 'Tasha Greene', email: 'tasha.g@example.com', role: 'Instructor', school: 'Maryvale High School', status: 'new', applied_at: ago(1), updated_at: ago(1) },
  { id: 'app-2', name: 'Luis Moreno', email: 'luis.m@example.com', role: 'Teaching assistant', school: 'Desert Edge High School', status: 'interviewing', applied_at: ago(5), updated_at: ago(2) },
  { id: 'app-3', name: 'Priya Shah', email: 'priya.s@example.com', role: 'Curriculum developer', school: null, status: 'offer', applied_at: ago(12), updated_at: ago(3) },
  { id: 'app-4', name: 'Devon Carter', email: 'devon.c@example.com', role: 'Instructor', school: 'Carl Hayden Community High School', status: 'hired', applied_at: ago(20), updated_at: ago(4) },
  { id: 'app-5', name: 'Mei Lin', email: 'mei.l@example.com', role: 'Teaching assistant', school: 'Maryvale High School', status: 'hired', applied_at: ago(30), updated_at: ago(10) },
]
