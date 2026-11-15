// Owner: Jacky. Student side of the curriculum builder in the local demo.
// Instructors publish modules in /instructor; they are saved in this browser
// (src/instructor/store.ts). This file reads those published modules and keeps
// each student's lesson progress next to them, per signed-in profile.
import { browserInstructorStore } from '../instructor/store.ts'
import type { Activity, ClassGroup, Course, Lesson, Module } from '../instructor/model.ts'
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
}

/** Lessons unlock one at a time: finish one to open the next (self-paced, like code.org). */
export function lessonRows(studentId: string, course: PublishedCourse): LessonRow[] {
  const { modules } = read(studentId)
  let previousFinished = true
  return course.modules.map((module) => {
    const ids = new Set(stepsOf(module).map((s) => s.activity.id))
    const progress = modules[module.id]
    const doneSteps = progress ? progress.done.filter((id) => ids.has(id)).length : 0
    const started = !!progress && (progress.step > 0 || doneSteps > 0)
    const state: LessonState = progress?.finished ? 'completed'
      : !previousFinished ? 'locked'
      : started ? 'in_progress' : 'available'
    previousFinished = !!progress?.finished
    return { module, state, doneSteps, totalSteps: ids.size }
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

export function joinedClasses(studentId: string): JoinedLocalClass[] {
  return read(studentId).classes
}

/** Joins a class an instructor created in this browser, by its join code. */
export function joinLocalClass(studentId: string, code: string): JoinedLocalClass {
  const wanted = code.trim().toUpperCase()
  const group = browserInstructorStore.load().classes.find((c: ClassGroup) => c.joinCode.toUpperCase() === wanted)
  if (!group) throw new Error('We couldn’t find a class with that code. Ask your teacher to check it.')
  const record = read(studentId)
  if (record.classes.some((c) => c.id === group.id)) throw new Error('You’re already in this class.')
  const joined = { id: group.id, name: group.name, school: group.school, courseId: group.courseId }
  record.classes.push(joined)
  write(studentId, record)
  return joined
}
