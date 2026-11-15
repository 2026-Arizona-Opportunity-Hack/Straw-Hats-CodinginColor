// Shared data contract. Mirrors supabase/migrations/0001_core_schema.sql.
// Owner: Aryan. Do not rename fields without a heads-up in #the-1000-sunny.

import type { ActivityContent, ActivityType } from './activities.ts'

export type Role = 'student' | 'instructor' | 'admin' | 'reviewer'

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'

/** self_paced: next module unlocks automatically. instructor_led: instructor releases modules. */
export type DeliveryMode = 'self_paced' | 'instructor_led'

export interface Profile {
  id: string
  role: Role
  display_name: string
  school: string | null
}

export interface Course {
  id: string
  title: string
  description: string
  level: CourseLevel
  delivery_mode: DeliveryMode
  /** true for CIC preset courses that instructors can copy into their own classes. */
  is_library: boolean
  /** Set when this course was copied from a library course. */
  copied_from: string | null
  owner_id: string | null
  published: boolean
}

export interface Module {
  id: string
  course_id: string
  position: number
  title: string
  concept: string
  published: boolean
}

export interface Lesson {
  id: string
  module_id: string
  position: number
  title: string
  is_checkpoint: boolean
}

export interface Activity<T extends ActivityType = ActivityType> {
  id: string
  lesson_id: string
  position: number
  type: T
  concept: string
  points: number
  /** Whether finishing this activity is required to unlock the next module. */
  counts_toward_unlock: boolean
  content: ActivityContent<T>
}

export interface CurriculumBlockComment {
  id: string
  activity_id: string
  class_id: string | null
  author_id: string
  author_name: string
  body: string
  created_at: string
}

export interface ClassRoom {
  id: string
  name: string
  school: string
  course_id: string
  join_code: string
  created_by: string
}

export interface ActivityAttempt {
  id: string
  student_id: string
  activity_id: string
  class_id: string
  response: unknown
  score: number | null
  is_correct: boolean | null
  started_at: string
  submitted_at: string | null
  time_on_task_ms: number
  attempt_no: number
}

/** Row in the instructor dashboard roster. */
export interface StudentProgress {
  student_id: string
  display_name: string
  current_module_id: string | null
  completed_activities: number
  total_activities: number
  last_active_at: string | null
  status: 'on_track' | 'stuck' | 'not_started' | 'done'
}
