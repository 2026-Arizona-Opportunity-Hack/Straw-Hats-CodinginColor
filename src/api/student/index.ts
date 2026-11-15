// Student data functions. Owner: Shivraj.
// The same interface supports Supabase-backed classes and the local demo.
import type { Activity, Course, Lesson, Module } from '../../shared/types/db.ts'
import { MOCK_ACTIVITIES, MOCK_COURSES, MOCK_LESSONS, MOCK_MODULES, mockDelay } from '../fixtures.ts'
import { supabase } from '../../shared/supabase.ts'

const curriculumBackend = import.meta.env.VITE_LIVE_STUDENT_CURRICULUM === 'true' ? supabase : null

export interface ModuleWithContent extends Module {
  lessons: (Lesson & { activities: Activity[] })[]
}

export interface ModuleStatus {
  module_id: string
  title: string
  state: 'locked' | 'available' | 'completed'
}

export interface AttemptInput {
  activity_id: string
  /** Accepted from existing players. The server resolves the student's enrollment. */
  class_id?: string
  response: unknown
  /** Practice score for the local demo. The live server scores assessed answers. */
  client_score?: number
  time_on_task_ms: number
}

export type StudentCourse = Pick<Course, 'id' | 'title' | 'description' | 'level' | 'delivery_mode'>
export type ActivityStatus = { activity_id: string; submitted: boolean; best_score: number | null }
type AttemptResult = { is_correct: boolean | null; score: number | null }

async function result<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data as T
}

export async function listMyCourses(): Promise<StudentCourse[]> {
  if (curriculumBackend) {
    const rows = await result<(Omit<StudentCourse, 'id'> & { course_id: string })[]>(curriculumBackend.rpc('my_courses'))
    const courses = rows.map(({ course_id, title, description, level, delivery_mode }) => ({
      id: course_id, title, description, level, delivery_mode,
    }))
    return [...new Map(courses.map(course => [course.id, course])).values()]
  }
  const enrolled = mockEnrolledCourseIds()
  return mockDelay(MOCK_COURSES.filter((c) => c.published && enrolled.includes(c.id)).map(toStudentCourse))
}

// Mock mode: the demo student starts in these courses; picked courses are added per browser.
const MOCK_DEFAULT_ENROLLED = ['course-intro-python', 'course-ai-basics']
const MOCK_ENROLLMENTS_KEY = 'cic.mockCourseEnrollments'
let mockPicked: string[] = []

function mockEnrolledCourseIds(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(MOCK_ENROLLMENTS_KEY) ?? '[]')
    if (Array.isArray(saved)) mockPicked = saved.filter((id): id is string => typeof id === 'string')
  } catch { /* storage blocked: keep the in-memory list */ }
  return [...new Set([...MOCK_DEFAULT_ENROLLED, ...mockPicked])]
}

const toStudentCourse = ({ id, title, description, level, delivery_mode }: Course): StudentCourse =>
  ({ id, title, description, level, delivery_mode })

/** Published self-paced courses the student can pick and is not in yet. */
export async function listAvailableCourses(): Promise<StudentCourse[]> {
  const enrolled = new Set((await listMyCourses()).map((c) => c.id))
  const courses = curriculumBackend
    ? await result<StudentCourse[]>(curriculumBackend.from('courses')
      .select('id, title, description, level, delivery_mode')
      .eq('published', true).eq('delivery_mode', 'self_paced').order('title'))
    : MOCK_COURSES.filter((c) => c.published && c.delivery_mode === 'self_paced').map(toStudentCourse)
  return courses.filter((c) => !enrolled.has(c.id))
}

/** Enroll the signed-in student in a self-paced course. Errors carry the server's code. */
export async function enrollInCourse(courseId: string): Promise<void> {
  if (curriculumBackend) {
    await result(curriculumBackend.rpc('enroll_in_course', { p_course_id: courseId }))
    return
  }
  const course = MOCK_COURSES.find((c) => c.id === courseId)
  if (!course?.published || course.delivery_mode !== 'self_paced') throw new Error('COURSE_NOT_AVAILABLE')
  mockPicked = [...new Set([...mockEnrolledCourseIds(), courseId])].filter((id) => !MOCK_DEFAULT_ENROLLED.includes(id))
  try {
    localStorage.setItem(MOCK_ENROLLMENTS_KEY, JSON.stringify(mockPicked))
  } catch { /* storage blocked: enrollment lasts until reload */ }
  await mockDelay(null)
}

const ENROLL_ERRORS: Record<string, string> = {
  COURSE_NOT_AVAILABLE: 'This course is not open for enrollment right now.',
  ALREADY_IN_CLASS: 'You already take this course with your class. Find it under My courses.',
  STUDENTS_ONLY: 'Only student accounts can enroll in courses.',
}

/** Plain words for an enrollment error. */
export function enrollErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return Object.entries(ENROLL_ERRORS).find(([key]) => code.includes(key))?.[1]
    ?? 'Could not enroll you right now. Check your connection and try again.'
}

export async function listModuleStatus(courseId: string): Promise<ModuleStatus[]> {
  if (curriculumBackend) {
    const rows = await result<(Omit<ModuleStatus, 'title'> & { module_title: string })[]>(
      curriculumBackend.rpc('my_course_progress', { p_course_id: courseId }),
    )
    return rows.map(({ module_id, module_title, state }) => ({ module_id, title: module_title, state }))
  }
  const modules = MOCK_MODULES.filter((m) => m.course_id === courseId).sort((a, b) => a.position - b.position)
  return mockDelay(
    modules.map((m, i) => ({ module_id: m.id, title: m.title, state: i === 0 ? 'available' : 'locked' })),
  )
}

export async function getModule(moduleId: string): Promise<ModuleWithContent | null> {
  if (curriculumBackend) return result(curriculumBackend.rpc('my_module_content', { p_module_id: moduleId }))
  const mod = MOCK_MODULES.find((m) => m.id === moduleId)
  if (!mod) return mockDelay(null)
  const lessons = MOCK_LESSONS.filter((l) => l.module_id === moduleId)
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      ...l,
      activities: MOCK_ACTIVITIES.filter((a) => a.lesson_id === l.id).sort((a, b) => a.position - b.position),
    }))
  return mockDelay({ ...mod, lessons })
}

export async function listActivityStatus(moduleId: string): Promise<ActivityStatus[]> {
  if (curriculumBackend) return result(curriculumBackend.rpc('my_module_activities', { p_module_id: moduleId }))
  return []
}

export async function recordAttempt(input: AttemptInput): Promise<AttemptResult> {
  if (curriculumBackend) return result(curriculumBackend.rpc('submit_attempt', {
    p_activity_id: input.activity_id,
    p_response: input.response ?? {},
    p_time_on_task_ms: input.time_on_task_ms,
  }))
  return mockDelay({ is_correct: null, score: input.client_score ?? null })
}

/** Where a student (including a late joiner) should start. */
export async function nextActivityFor(courseId: string): Promise<{ module_id: string; activity_id: string } | null> {
  if (curriculumBackend) return result(curriculumBackend.rpc('my_next_activity', { p_course_id: courseId }))
  const first = MOCK_MODULES.filter((m) => m.course_id === courseId).sort((a, b) => a.position - b.position)[0]
  const lesson = first && MOCK_LESSONS.find((l) => l.module_id === first.id)
  const activity = lesson && MOCK_ACTIVITIES.find((a) => a.lesson_id === lesson.id)
  return mockDelay(first && activity ? { module_id: first.id, activity_id: activity.id } : null)
}
