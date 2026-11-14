// Student data functions. Owner: Shivraj.
// Frontend (Jacky) calls ONLY these. Each starts as a mock; swap the body for a
// real Supabase call without changing the signature.
import type { Activity, Course, Lesson, Module } from '../../shared/types/db.ts'
import { MOCK_ACTIVITIES, MOCK_COURSES, MOCK_LESSONS, MOCK_MODULES, mockDelay } from '../fixtures.ts'

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
  class_id: string
  response: unknown
  /** 0..1 when the client can grade (interactive HTML); server grades everything else. */
  client_score?: number
  time_on_task_ms: number
}

export async function listMyCourses(): Promise<Course[]> {
  return mockDelay(MOCK_COURSES.filter((c) => c.published))
}

export async function listModuleStatus(courseId: string): Promise<ModuleStatus[]> {
  const modules = MOCK_MODULES.filter((m) => m.course_id === courseId).sort((a, b) => a.position - b.position)
  return mockDelay(
    modules.map((m, i) => ({ module_id: m.id, title: m.title, state: i === 0 ? 'available' : 'locked' })),
  )
}

export async function getModule(moduleId: string): Promise<ModuleWithContent | null> {
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

export async function recordAttempt(input: AttemptInput): Promise<{ is_correct: boolean | null; score: number | null }> {
  return mockDelay({ is_correct: null, score: input.client_score ?? null })
}

/** Where a student (including a late joiner) should start. */
export async function nextActivityFor(courseId: string): Promise<{ module_id: string; activity_id: string } | null> {
  const first = MOCK_MODULES.filter((m) => m.course_id === courseId).sort((a, b) => a.position - b.position)[0]
  const lesson = first && MOCK_LESSONS.find((l) => l.module_id === first.id)
  const activity = lesson && MOCK_ACTIVITIES.find((a) => a.lesson_id === lesson.id)
  return mockDelay(first && activity ? { module_id: first.id, activity_id: activity.id } : null)
}
