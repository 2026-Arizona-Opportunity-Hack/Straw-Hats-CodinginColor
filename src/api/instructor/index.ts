// Instructor, admin and reviewer data functions. Owner: Ruthvik.
// Frontend (Ken, Aryan) calls ONLY these. Each starts as a mock; swap the body
// for a real Supabase call without changing the signature.
import type { Activity, ClassRoom, Course, Role, StudentProgress } from '../../shared/types/db.ts'
import { MOCK_COURSES, mockDelay } from '../fixtures.ts'

const MOCK_CLASSES: ClassRoom[] = [
  {
    id: 'class-maryvale-p3',
    name: 'Maryvale Period 3',
    school: 'Maryvale HS',
    course_id: 'course-intro-python',
    join_code: 'MVP3-7Q',
    created_by: 'mock-instructor',
  },
]

const MOCK_PROGRESS: StudentProgress[] = [
  { student_id: 's1', display_name: 'Maya R.', current_module_id: 'mod-loops', completed_activities: 3, total_activities: 4, last_active_at: '2026-11-14T18:00:00Z', status: 'on_track' },
  { student_id: 's2', display_name: 'Jordan T.', current_module_id: 'mod-loops', completed_activities: 2, total_activities: 4, last_active_at: '2026-11-10T18:00:00Z', status: 'stuck' },
  { student_id: 's3', display_name: 'Ana P.', current_module_id: null, completed_activities: 0, total_activities: 4, last_active_at: null, status: 'not_started' },
]

export interface RosterRow {
  display_name: string
  school: string
}

export interface CreatedLogin {
  display_name: string
  username: string
  passcode: string
}

// ---- Classes -------------------------------------------------------------

export async function listMyClasses(): Promise<ClassRoom[]> {
  return mockDelay(MOCK_CLASSES)
}

export async function createClass(input: { name: string; school: string; course_id: string }): Promise<ClassRoom> {
  return mockDelay({ ...input, id: `class-${Date.now()}`, join_code: 'NEW-000', created_by: 'mock-instructor' })
}

export async function getClassProgress(_classId: string): Promise<StudentProgress[]> {
  return mockDelay(MOCK_PROGRESS)
}

/** Parses nothing: the caller passes already-parsed rows. Server validates again. */
export async function importRoster(_classId: string, rows: RosterRow[]): Promise<CreatedLogin[]> {
  return mockDelay(
    rows.map((r, i) => ({ display_name: r.display_name, username: `student${i + 1}`, passcode: 'mock-pass' })),
  )
}

// ---- Curriculum ----------------------------------------------------------

export async function listLibraryCourses(): Promise<Course[]> {
  return mockDelay(MOCK_COURSES.filter((c) => c.is_library))
}

/** Deep-copies a library course (modules, lessons, activities) into an instructor-owned course. */
export async function copyLibraryCourse(courseId: string): Promise<Course> {
  const src = MOCK_COURSES.find((c) => c.id === courseId)
  if (!src) throw new Error(`Course ${courseId} not found`)
  return mockDelay({ ...src, id: `${src.id}-copy`, is_library: false, copied_from: src.id, owner_id: 'mock-instructor', published: false })
}

export async function saveActivity(activity: Activity): Promise<Activity> {
  return mockDelay(activity)
}

// ---- Admin ---------------------------------------------------------------

export interface UserRow {
  id: string
  display_name: string
  role: Role
  school: string | null
}

export async function listUsers(): Promise<UserRow[]> {
  return mockDelay([
    { id: 'mock-instructor', display_name: 'Mr. Lopez', role: 'instructor', school: 'Maryvale HS' },
    { id: 's1', display_name: 'Maya R.', role: 'student', school: 'Maryvale HS' },
  ])
}

export async function setUserRole(_userId: string, _role: Role): Promise<void> {
  return mockDelay(undefined)
}
