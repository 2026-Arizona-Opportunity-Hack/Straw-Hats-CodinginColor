// Owner: Jacky. Student side of the curriculum builder in the local demo.
// Instructors publish modules in /instructor; they are saved in this browser
// (src/instructor/store.ts). This file reads those published modules and keeps
// each student's lesson progress next to them, per signed-in profile.
import { browserInstructorStore } from '../instructor/store.ts'
import type { Activity, ClassGroup, Course, Learner, Lesson, Module } from '../instructor/model.ts'
import { isLocalDemo } from '../shared/supabase.ts'

export type PublishedCourse = Omit<Course, 'modules'> & { modules: Module[] }
export type Step = { activity: Activity; lesson: Lesson }

/** Courses with at least one published module, in the instructor's order. */
export function publishedCourses(): PublishedCourse[] {
  if (!isLocalDemo) return []
  return browserInstructorStore.load().courses
    .map((course) => ({ ...course, modules: course.modules.filter((m) => m.published && m.lessons.length > 0) }))
    .filter((course) => course.modules.length > 0)
}

export function findModule(moduleId: string) {
  for (const course of publishedCourses()) {
    const index = course.modules.findIndex((m) => m.id === moduleId)
    if (index >= 0) return { course, module: course.modules[index], next: course.modules[index + 1] }
  }
  return null
}

export function stepsOf(module: Module): Step[] {
  return module.lessons.flatMap((lesson) => lesson.activities.map((activity) => ({ activity, lesson })))
}

// ---- Progress (one record per student, saved in this browser) -------------------

export interface ModuleProgress {
  /** Activity ids the student finished. */
  done: string[]
  /** Step the student was last on, so they resume there. */
  step: number
  finished: boolean
  /** First-try score per graded activity, 0..1. */
  scores: Record<string, number>
  updatedAt: string
}

export interface JoinedLocalClass {
  id: string
  name: string
  school: string
  courseId: string
}

interface StudentRecord {
  modules: Record<string, ModuleProgress>
  classes: JoinedLocalClass[]
}

const key = (studentId: string) => `cic-learn.student-flow.v1:${studentId}`

function read(studentId: string): StudentRecord {
  try {
    const saved = JSON.parse(localStorage.getItem(key(studentId)) || 'null')
    if (saved && typeof saved.modules === 'object' && Array.isArray(saved.classes)) return saved
  } catch {
    // Storage blocked or corrupted: start fresh.
  }
  return { modules: {}, classes: [] }
}

function write(studentId: string, record: StudentRecord) {
  try {
    localStorage.setItem(key(studentId), JSON.stringify(record))
  } catch {
    // Storage full or blocked: progress lasts until the tab closes.
  }
}

export function emptyProgress(): ModuleProgress {
  return { done: [], step: 0, finished: false, scores: {}, updatedAt: new Date().toISOString() }
}

export function loadProgress(studentId: string, moduleId: string): ModuleProgress {
  return { ...emptyProgress(), ...read(studentId).modules[moduleId] }
}

export function saveProgress(studentId: string, moduleId: string, progress: ModuleProgress) {
  const record = read(studentId)
  record.modules[moduleId] = { ...progress, updatedAt: new Date().toISOString() }
  write(studentId, record)
}

export type LessonState = 'locked' | 'available' | 'in_progress' | 'completed'

export interface LessonRow {
  module: Module
  state: LessonState
  doneSteps: number
  totalSteps: number
  /** Activity ids finished in this lesson. */
  doneIds: string[]
}

/** Lessons unlock one at a time: finish one to open the next (self-paced, like code.org). */
export function lessonRows(studentId: string, course: PublishedCourse): LessonRow[] {
  const { modules } = read(studentId)
  let previousFinished = true
  return course.modules.map((module) => {
    const ids = new Set(stepsOf(module).map((s) => s.activity.id))
    const progress = modules[module.id]
    const doneIds = progress ? progress.done.filter((id) => ids.has(id)) : []
    const doneSteps = doneIds.length
    const started = !!progress && (progress.step > 0 || doneSteps > 0)
    const state: LessonState = progress?.finished ? 'completed'
      : !previousFinished ? 'locked'
      : started ? 'in_progress' : 'available'
    previousFinished = !!progress?.finished
    return { module, state, doneSteps, totalSteps: ids.size, doneIds }
  })
}

/** The lesson the student touched most recently and hasn't finished, for "Pick up where you left off". */
export function resumeTarget(studentId: string) {
  const { modules } = read(studentId)
  let best: { course: PublishedCourse; row: LessonRow; at: string } | null = null
  for (const course of publishedCourses()) {
    for (const row of lessonRows(studentId, course)) {
      const at = modules[row.module.id]?.updatedAt
      if (row.state === 'in_progress' && at && (!best || at > best.at)) best = { course, row, at }
    }
  }
  return best
}

// ---- Classes ----------------------------------------------------------------------
// Joining adds the student to the teacher's roster in the instructor workspace (same browser),
// and finished steps are copied into that roster so the teacher sees progress, scores and time.

/**
 * Example code for demos. The seeded Supabase class "Maryvale Period 3" (teacher@cic.demo) uses it,
 * so it opens the matching Maryvale class in the local demo too.
 */
export const EXAMPLE_CLASS_CODE = 'MARY-P3'
const CODE_ALIASES: Record<string, string> = { 'MARY-P3': 'maryvale' }

export function joinedClasses(studentId: string): JoinedLocalClass[] {
  return read(studentId).classes
}

/** Name of the teacher who runs a class in the instructor workspace. */
export function teacherFor(classId: string): string | null {
  const staff = browserInstructorStore.load().staff
  return staff.find((s) => s.role === 'instructor' && s.classIds.includes(classId))?.name ?? null
}

function saveInstructorData(change: (classes: ClassGroup[]) => void) {
  try {
    const data = browserInstructorStore.load()
    const previous = structuredClone(data)
    change(data.classes)
    void browserInstructorStore.save(data, previous)
  } catch {
    // Storage blocked: the student still sees the class; the teacher won't until storage works.
  }
}

/** Joins a class an instructor created in this browser, by its join code. */
export function joinLocalClass(student: { id: string; name: string }, code: string): JoinedLocalClass {
  const wanted = code.trim().toUpperCase()
  const classes = browserInstructorStore.load().classes
  const group = classes.find((c) => c.joinCode.toUpperCase() === wanted) ?? classes.find((c) => c.id === CODE_ALIASES[wanted])
  if (!group) throw new Error('We couldn’t find a class with that code. Ask your teacher to check it.')
  const record = read(student.id)
  if (record.classes.some((c) => c.id === group.id)) throw new Error('You’re already in this class.')
  const joined = { id: group.id, name: group.name, school: group.school, courseId: group.courseId }
  record.classes.push(joined)
  write(student.id, record)

  // Put the student on the teacher's roster, with any lessons they already finished.
  saveInstructorData((all) => {
    const target = all.find((c) => c.id === group.id)
    if (!target || target.learners.some((l) => l.id === student.id)) return
    const learner: Learner = {
      id: student.id, name: student.name, passcode: '', baseline: null, attempts: [], hints: [], lastActive: new Date().toISOString(),
    }
    for (const [, progress] of Object.entries(record.modules)) {
      for (const activityId of progress.done) {
        const score = progress.scores[activityId]
        learner.attempts.push({ activityId, score: score == null ? null : Math.round(score * 100), minutes: 1, count: 1, submitted: true })
      }
    }
    target.learners.push(learner)
  })
  return joined
}

/** Copies one finished step into the roster of every class this student joined for that course. */
export function reportStep(studentId: string, courseId: string, activityId: string, score: number | null, minutes: number) {
  const mine = read(studentId).classes.filter((c) => c.courseId === courseId).map((c) => c.id)
  if (!mine.length) return
  saveInstructorData((all) => {
    for (const group of all.filter((c) => mine.includes(c.id))) {
      const learner = group.learners.find((l) => l.id === studentId)
      if (!learner) continue
      const existing = learner.attempts.find((a) => a.activityId === activityId)
      const pct = score == null ? null : Math.round(score * 100)
      if (existing) {
        existing.count += 1
        existing.minutes += minutes
        existing.submitted = true
        if (existing.score == null) existing.score = pct
      } else {
        learner.attempts.push({ activityId, score: pct, minutes, count: 1, submitted: true })
      }
      learner.lastActive = new Date().toISOString()
    }
  })
}
