// Owner: Aryan. Add routes here; page components live in each owner's folder.
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AdminHome, AdminUsers } from './admin/AdminPages.tsx'
import { CourseLibrary } from './instructor/CourseLibrary.tsx'
import { InstructorHome } from './instructor/InstructorHome.tsx'
import { LoginPage } from './LoginPage.tsx'
import { ReviewerHome } from './reviewer/ReviewerHome.tsx'
import { RequireRole } from './shared/auth/RequireRole.tsx'
import { AppLayout } from './shared/ui/AppLayout.tsx'
import { ModulePlayer } from './student/ModulePlayer.tsx'
import { StudentHome } from './student/StudentHome.tsx'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      {
        path: 'student',
        element: <RequireRole roles={['student']}><StudentHome /></RequireRole>,
      },
      {
        path: 'student/module/:moduleId',
        element: <RequireRole roles={['student']}><ModulePlayer /></RequireRole>,
      },
      {
        path: 'instructor',
        element: <RequireRole roles={['instructor', 'admin']}><InstructorHome /></RequireRole>,
      },
      {
        path: 'instructor/library',
        element: <RequireRole roles={['instructor', 'admin']}><CourseLibrary /></RequireRole>,
      },
      {
        path: 'admin',
        element: <RequireRole roles={['admin']}><AdminHome /></RequireRole>,
      },
      {
        path: 'admin/users',
        element: <RequireRole roles={['admin']}><AdminUsers /></RequireRole>,
      },
      {
        path: 'reviewer',
        element: <RequireRole roles={['reviewer', 'admin']}><ReviewerHome /></RequireRole>,
      },
      { path: '*', element: <p>Page not found.</p> },
    ],
  },
])
