// Page components loaded on demand. Each section is downloaded only when someone opens it,
// so students on slow school internet never load the admin charts or the instructor workspace.
import { lazy, Suspense, type ComponentType } from 'react'
import { RequireRole } from './shared/auth/RequireRole.tsx'
import type { Role } from './shared/types/db.ts'

const admin = () => import('./admin/AdminPages.tsx')
export const AdminHome = lazy(() => admin().then(m => ({ default: m.AdminHome })))
export const AdminUsers = lazy(() => admin().then(m => ({ default: m.AdminUsers })))
export const AdminClasses = lazy(() => admin().then(m => ({ default: m.AdminClasses })))
export const AdminAnalytics = lazy(() => admin().then(m => ({ default: m.AdminAnalytics })))
export const AdminSettings = lazy(() => admin().then(m => ({ default: m.AdminSettings })))
export const InstructorRoute = lazy(() => import('./instructor/InstructorRoute.tsx').then(m => ({ default: m.InstructorRoute })))
export const StudentHome = lazy(() => import('./student/StudentHome.tsx').then(m => ({ default: m.StudentHome })))
export const StudentCourse = lazy(() => import('./student/StudentCourse.tsx').then(m => ({ default: m.StudentCourse })))
export const StudentExplore = lazy(() => import('./student/StudentExplore.tsx').then(m => ({ default: m.StudentExplore })))
export const PublishedDemo = lazy(() => import('./student/PublishedDemo.tsx').then(m => ({ default: m.PublishedDemo })))
export const StudentCourses = lazy(() => import('./student/StudentCourses.tsx').then(m => ({ default: m.StudentCourses })))
export const StudentClassroom = lazy(() => import('./student/StudentClassroom.tsx').then(m => ({ default: m.StudentClassroom })))
export const StarterQuiz = lazy(() => import('./student/placement/StarterQuiz.tsx').then(m => ({ default: m.StarterQuiz })))
export const StudentQuiz = lazy(() => import('./student/StudentQuiz.tsx').then(m => ({ default: m.StudentQuiz })))
export const ModulePlayer = lazy(() => import('./student/ModulePlayer.tsx').then(m => ({ default: m.ModulePlayer })))

/** A page for these roles, with a loading message while its code downloads. */
export function RolePage({ roles, page: Page }: { roles: Role[]; page: ComponentType }) {
  return <RequireRole roles={roles}>
    <Suspense fallback={<p className="p-6" role="status">Loading…</p>}><Page /></Suspense>
  </RequireRole>
}
