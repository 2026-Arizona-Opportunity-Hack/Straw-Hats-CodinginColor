// Student data functions. Owner: Shivraj.
// The same interface supports Supabase-backed classes and the local demo.
import type { Activity, Course, Lesson, Module } from '../../shared/types/db.ts'
import { MOCK_ACTIVITIES, MOCK_COURSES, MOCK_LESSONS, MOCK_MODULES, mockDelay } from '../fixtures.ts'
import { supabase } from '../../shared/supabase.ts'
import type { VerifyWebLab } from '../../shared/labs/CodeLab.tsx'
import type { DiscussionState } from '../../shared/types/activities.ts'

const curriculumBackend = import.meta.env.VITE_LIVE_STUDENT_CURRICULUM === 'true' ? supabase : null
const mockCheckAnswers = new Map([['act-var-check', 'b']])

export interface ModuleWithContent extends Module {
  lessons: (Lesson & { activities: Activity[] })[]
}

export interface ModuleStatus {
  module_id: string
  title: string
  state: 'locked' | 'available' | 'completed'
  /** Passed the pretest, so the module counts as completed (late joiners). */
  tested_out?: boolean
  pretest_score?: number | null
  posttest_best?: number | null
  /** Final-check tries used, and how many count (class courses only). */
  posttest_tries?: number
  max_tries?: number | null
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

export type CatalogCourse = Pick<Course, 'id' | 'title' | 'description' | 'level' | 'delivery_mode'>
/** A course the student is in: through a class (`class_name` set) or chosen on their own. */
export type StudentCourse = CatalogCourse & { source: 'class' | 'self'; class_name: string | null }
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
    const courses = rows.map(({ course_id, title, description, level, delivery_mode, source, class_name }) => ({
      id: course_id, title, description, level, delivery_mode, source, class_name,
    }))
    return [...new Map(courses.map(course => [course.id, course])).values()]
  }
  return mockDelay(MOCK_COURSES.filter((c) => c.published).map((c) => ({ ...c, source: 'self' as const, class_name: null })))
}

/** Every published original course, for Explore. Teachers' class copies are left out
 * (students in that class still see their copy in My courses). Module lists stay hidden until the student enrolls. */
export async function listCatalog(): Promise<CatalogCourse[]> {
  if (curriculumBackend) {
    return result(curriculumBackend.from('courses').select('id, title, description, level, delivery_mode')
      .eq('published', true).is('copied_from', null).order('title'))
  }
  return mockDelay(MOCK_COURSES.filter((c) => c.published))
}

const ENROLL_ERRORS: Record<string, string> = {
  ALREADY_IN_CLASS: 'You already take this course with your class.',
  COURSE_NOT_AVAILABLE: 'This course runs with a class. Ask your teacher for the class code.',
  STUDENTS_ONLY: 'Only student accounts can add courses.',
}

/** Adds a self-paced course to the student's own courses. */
export async function enrollInCourse(courseId: string): Promise<void> {
  if (!curriculumBackend) return mockDelay(undefined)
  const { error } = await curriculumBackend.rpc('enroll_in_course', { p_course_id: courseId })
  if (error) throw new Error(Object.entries(ENROLL_ERRORS).find(([code]) => error.message.includes(code))?.[1] ?? error.message)
}

export async function listModuleStatus(courseId: string): Promise<ModuleStatus[]> {
  if (curriculumBackend) {
    const rows = await result<(Omit<ModuleStatus, 'title'> & { module_title: string })[]>(
      curriculumBackend.rpc('my_course_progress', { p_course_id: courseId }),
    )
    return rows.map(({ module_id, module_title, state, tested_out, pretest_score, posttest_best, posttest_tries, max_tries }) => ({
      module_id, title: module_title, state, tested_out, pretest_score, posttest_best, posttest_tries, max_tries,
    }))
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
  const mockAnswer = mockCheckAnswers.get(input.activity_id)
  if (mockAnswer && input.response && typeof input.response === 'object' && 'choice_id' in input.response) {
    const isCorrect = input.response.choice_id === mockAnswer
    return mockDelay({ is_correct: isCorrect, score: isCorrect ? 1 : 0 })
  }
  return mockDelay({ is_correct: null, score: input.client_score ?? null })
}

export async function checkCatPhotoLab(activityId: string, source: string, signal: AbortSignal): ReturnType<VerifyWebLab> {
  if (curriculumBackend) return result(curriculumBackend.functions.invoke('cat-photo-check', { body: { activityId, source }, signal }))
  return (await import('../../shared/labs/catPhoto.ts')).previewCatPhotoChecks(source)
}

export async function getClassmateNotes(activityId: string): Promise<DiscussionState> {
  if (!curriculumBackend) return { enabled: false, shared: false, notes: [] }
  return result(curriculumBackend.rpc('my_discussion_notes', { p_activity_id: activityId }))
}

/** Where a student (including a late joiner) should start. */
export async function nextActivityFor(courseId: string): Promise<{ module_id: string; activity_id: string } | null> {
  if (curriculumBackend) return result(curriculumBackend.rpc('my_next_activity', { p_course_id: courseId }))
  const first = MOCK_MODULES.filter((m) => m.course_id === courseId).sort((a, b) => a.position - b.position)[0]
  const lesson = first && MOCK_LESSONS.find((l) => l.module_id === first.id)
  const activity = lesson && MOCK_ACTIVITIES.find((a) => a.lesson_id === lesson.id)
  return mockDelay(first && activity ? { module_id: first.id, activity_id: activity.id } : null)
}
